// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {TabySettlement} from "../src/TabySettlement.sol";

contract MockUsdc {
    enum FailureMode {
        None,
        ReturnFalse,
        RevertCall,
        ReturnNothing
    }

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    FailureMode public failureMode;
    uint256 public failOnTransferCall;
    uint256 public transferCallCount;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function setFailureMode(FailureMode mode) external {
        failureMode = mode;
    }

    function setFailOnTransferCall(uint256 callNumber) external {
        failOnTransferCall = callNumber;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        transferCallCount += 1;

        if (failureMode == FailureMode.RevertCall || transferCallCount == failOnTransferCall) {
            revert("TRANSFER_REVERTED");
        }

        if (failureMode == FailureMode.ReturnFalse) {
            return false;
        }

        if (allowance[from][msg.sender] < amount || balanceOf[from] < amount) {
            return false;
        }

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (failureMode == FailureMode.ReturnNothing) {
            assembly {
                return(0, 0)
            }
        }

        return true;
    }
}

contract TabySettlementTest is Test {
    event FinalTabRegistered(
        bytes32 indexed tabKey,
        bytes32 indexed applicationTabIdHash,
        bytes32 indexed proposalHash,
        address coordinator,
        uint256 expiresAt,
        uint256 totalSettlementAmount
    );
    event FinalTabCancelled(
        bytes32 indexed tabKey, bytes32 indexed proposalHash, address coordinator, address cancellingCaller
    );
    event FinalTabAuthorized(
        bytes32 indexed tabKey,
        bytes32 indexed proposalHash,
        address indexed debtor,
        uint256 exactAmount,
        uint256 expiresAt,
        uint256 nonce
    );
    event FinalTabAuthorizationRevoked(
        bytes32 indexed tabKey, bytes32 indexed proposalHash, address indexed debtor, uint256 nonce
    );
    event FinalTabSettled(
        bytes32 indexed tabKey,
        bytes32 indexed proposalHash,
        address indexed executor,
        address token,
        uint256 totalAmount,
        uint256 transferCount,
        bytes32 transfersHash
    );

    address private constant ARBITRUM_SEPOLIA_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
    address private coordinator = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address private other = address(0xB0B);
    address private debtorA = address(0xA1);
    address private debtorB = address(0xB1);
    address private creditorA = address(0xC1);
    address private creditorB = address(0xC2);

    MockUsdc private token;
    TabySettlement private settlement;

    bytes32 private constant APPLICATION_TAB_ID_HASH = keccak256(bytes("11111111-1111-4111-8111-111111111111"));
    bytes32 private constant INCLUDED_HASH = 0xacb371cd6d4dcd71a67a09d04888d4c6b37180b0bef96be428225fb69c9ce63b;
    bytes32 private constant EXCLUDED_HASH = 0x92fd7ed3639a058a3940e1a80c61e19cc9edcc6401f18baa8fa45a113d1eddbf;
    bytes32 private constant FINAL_TAB_VECTOR_HASH = 0xbce86c4312bb1677def3be989993ecbdaff3ee18966426fd0dbd4c0b5269a7cb;
    bytes32 private constant FINAL_TAB_TRANSFERS_HASH =
        0x203cb1d323e5c7e230ee43da6dfcfa508c4a7ddb11346d4c50b477b643008467;

    function setUp() public {
        vm.chainId(421614);
        vm.warp(1_783_000_000);
        token = new MockUsdc();
        settlement = new TabySettlement(address(token));
    }

    function test_constructorRejectsZeroToken() public {
        vm.expectRevert(TabySettlement.ZeroSupportedToken.selector);
        new TabySettlement(address(0));
    }

    function test_finalTabHashVectorMatchesTypeScript() public view {
        TabySettlement.FinalTabPayload memory payload = _vectorPayload(4_000_000, 10_000_000, 1);
        TabySettlement.SettlementTransfer[] memory transfers = _vectorTransfers(4_000_000, 10_000_000);

        assertEq(settlement.hashFinalTabPayloadMemory(payload), FINAL_TAB_VECTOR_HASH);
        assertEq(settlement.hashTransfers(transfers), FINAL_TAB_TRANSFERS_HASH);
    }

    function test_finalTabHashVectorChangesForMaterialFields() public view {
        bytes32 proposalHash = settlement.hashFinalTabPayloadMemory(_vectorPayload(4_000_000, 10_000_000, 1));
        bytes32 changedAmount = settlement.hashFinalTabPayloadMemory(_vectorPayload(4_000_001, 10_000_000, 1));
        bytes32 changedVersion = settlement.hashFinalTabPayloadMemory(_vectorPayload(4_000_000, 10_000_000, 2));

        assertEq(proposalHash, FINAL_TAB_VECTOR_HASH);
        assertNotEq(changedAmount, proposalHash);
        assertNotEq(changedVersion, proposalHash);
    }

    function test_registerFinalTabStoresActiveProposalAndEmitsEvent() public {
        TabySettlement.FinalTabPayload memory payload = _payload(_twoTransfers());
        bytes32 proposalHash = settlement.hashFinalTabPayloadMemory(payload);

        vm.expectEmit(true, true, true, true);
        emit FinalTabRegistered(
            payload.tabKey,
            payload.applicationTabIdHash,
            proposalHash,
            coordinator,
            payload.expiresAt,
            payload.totalSettlementAmount
        );

        vm.prank(coordinator);
        settlement.registerFinalTab(payload, proposalHash);

        TabySettlement.ActiveFinalTab memory active = settlement.getActiveFinalTab(payload.tabKey);
        assertEq(active.coordinator, coordinator);
        assertEq(active.applicationTabIdHash, payload.applicationTabIdHash);
        assertEq(active.proposalHash, proposalHash);
        assertEq(active.totalSettlementAmount, payload.totalSettlementAmount);
    }

    function test_registerFinalTabRejectsNonCoordinatorAndDuplicateActiveProposal() public {
        TabySettlement.FinalTabPayload memory payload = _payload(_oneTransfer());
        bytes32 proposalHash = settlement.hashFinalTabPayloadMemory(payload);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.CallerIsNotCoordinator.selector, other, coordinator));
        settlement.registerFinalTab(payload, proposalHash);

        _register(payload, proposalHash);

        vm.prank(coordinator);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.ActiveProposalAlreadyExists.selector, payload.tabKey, proposalHash)
        );
        settlement.registerFinalTab(payload, proposalHash);
    }

    function test_registerFinalTabRejectsWrongChainTokenContractExpiryAndHash() public {
        TabySettlement.FinalTabPayload memory payload = _payload(_oneTransfer());
        bytes32 proposalHash = settlement.hashFinalTabPayloadMemory(payload);

        payload.chainId = 1;
        vm.prank(coordinator);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.UnsupportedChain.selector, 1));
        settlement.registerFinalTab(payload, proposalHash);

        payload = _payload(_oneTransfer());
        payload.token = address(0xDEAD);
        vm.prank(coordinator);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.UnsupportedToken.selector, address(0xDEAD)));
        settlement.registerFinalTab(payload, proposalHash);

        payload = _payload(_oneTransfer());
        payload.settlementContract = address(0xDEAD);
        vm.prank(coordinator);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.WrongSettlementContract.selector, address(0xDEAD)));
        settlement.registerFinalTab(payload, proposalHash);

        payload = _payload(_oneTransfer());
        payload.expiresAt = block.timestamp;
        vm.prank(coordinator);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.ExpiredFinalTab.selector, block.timestamp));
        settlement.registerFinalTab(payload, proposalHash);

        payload = _payload(_oneTransfer());
        vm.prank(coordinator);
        vm.expectRevert();
        settlement.registerFinalTab(payload, keccak256("changed"));
    }

    function test_cancelFinalTabClearsActiveProposalAndPermanentlyBlocksHash() public {
        TabySettlement.FinalTabPayload memory payload = _payload(_oneTransfer());
        bytes32 proposalHash = _register(payload);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.CallerIsNotCoordinator.selector, other, coordinator));
        settlement.cancelFinalTab(payload.tabKey, proposalHash);

        vm.expectEmit(true, true, false, true);
        emit FinalTabCancelled(payload.tabKey, proposalHash, coordinator, coordinator);

        vm.prank(coordinator);
        settlement.cancelFinalTab(payload.tabKey, proposalHash);

        TabySettlement.ActiveFinalTab memory active = settlement.getActiveFinalTab(payload.tabKey);
        assertEq(active.proposalHash, bytes32(0));
        assertTrue(settlement.cancelledProposalHashes(proposalHash));

        vm.prank(coordinator);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.ProposalAlreadyCancelled.selector, proposalHash));
        settlement.registerFinalTab(payload, proposalHash);

        vm.prank(debtorA);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.NoActiveProposal.selector, payload.tabKey));
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_000, block.timestamp + 100, 1);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.NoActiveProposal.selector, payload.tabKey));
        settlement.settleFinalTab(payload, _oneTransfer());
    }

    function test_authorizeFinalTabRecordsExactAmountAndRejectsWrongProposalExpiryAndNonceReplay() public {
        TabySettlement.FinalTabPayload memory payload = _payload(_oneTransfer());
        bytes32 proposalHash = _register(payload);

        vm.expectEmit(true, true, true, true);
        emit FinalTabAuthorized(payload.tabKey, proposalHash, debtorA, 1_000_000, block.timestamp + 100, 7);

        vm.prank(debtorA);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_000, block.timestamp + 100, 7);

        TabySettlement.FinalTabAuthorization memory authorization = settlement.getAuthorization(proposalHash, debtorA);
        assertEq(authorization.amount, 1_000_000);
        assertEq(authorization.nonce, 7);
        assertFalse(authorization.revoked);
        assertTrue(settlement.isNonceConsumed(proposalHash, debtorA, 7));

        vm.prank(debtorA);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.NonceAlreadyUsed.selector, proposalHash, debtorA, 7));
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_000, block.timestamp + 100, 7);

        vm.prank(debtorA);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.InvalidProposalHash.selector, proposalHash, keccak256("x"))
        );
        settlement.authorizeFinalTab(payload.tabKey, keccak256("x"), 1_000_000, block.timestamp + 100, 8);

        vm.prank(debtorA);
        vm.expectRevert(TabySettlement.InvalidExpiryRelationship.selector);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_000, payload.expiresAt + 1, 8);
    }

    function test_revokeFinalTabBlocksSettlement() public {
        TabySettlement.SettlementTransfer[] memory transfers = _oneTransfer();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundApproveAndAuthorize(payload, proposalHash, transfers);

        vm.expectEmit(true, true, true, true);
        emit FinalTabAuthorizationRevoked(payload.tabKey, proposalHash, debtorA, 1);

        vm.prank(debtorA);
        settlement.revokeFinalTab(payload.tabKey, proposalHash, 1);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.AuthorizationRevoked.selector, proposalHash, debtorA));
        settlement.settleFinalTab(payload, transfers);
    }

    function test_settleFinalTabTransfersFundsEmitsEventAndCannotSettleTwice() public {
        TabySettlement.SettlementTransfer[] memory transfers = _twoTransfers();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundApproveAndAuthorize(payload, proposalHash, transfers);

        vm.expectEmit(true, true, true, true);
        emit FinalTabSettled(
            payload.tabKey, proposalHash, other, address(token), 15_500_000, 2, settlement.hashTransfers(transfers)
        );

        vm.prank(other);
        settlement.settleFinalTab(payload, transfers);

        assertEq(token.balanceOf(debtorA), 10_000_000);
        assertEq(token.balanceOf(debtorB), 10_000_000);
        assertEq(token.balanceOf(creditorA), 12_500_000);
        assertEq(token.balanceOf(creditorB), 3_000_000);
        assertTrue(settlement.settledProposalHashes(proposalHash));
        assertEq(settlement.getActiveFinalTab(payload.tabKey).proposalHash, bytes32(0));

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.NoActiveProposal.selector, payload.tabKey));
        settlement.settleFinalTab(payload, transfers);
    }

    function test_settleFinalTabAllowsOneDebtorPayingMultipleCreditorsAndMultipleDebtorsPayingOneCreditor() public {
        TabySettlement.SettlementTransfer[] memory splitDebtor = new TabySettlement.SettlementTransfer[](2);
        splitDebtor[0] = _transfer("member-a", "member-c", debtorA, creditorA, 2_000_000, 0);
        splitDebtor[1] = _transfer("member-a", "member-d", debtorA, creditorB, 3_000_000, 1);
        _settleHappyPath(splitDebtor);
        assertEq(token.balanceOf(creditorA), 2_000_000);
        assertEq(token.balanceOf(creditorB), 3_000_000);

        token = new MockUsdc();
        settlement = new TabySettlement(address(token));

        TabySettlement.SettlementTransfer[] memory sharedCreditor = new TabySettlement.SettlementTransfer[](2);
        sharedCreditor[0] = _transfer("member-a", "member-c", debtorA, creditorA, 2_000_000, 0);
        sharedCreditor[1] = _transfer("member-b", "member-c", debtorB, creditorA, 3_000_000, 1);
        _settleHappyPath(sharedCreditor);
        assertEq(token.balanceOf(creditorA), 5_000_000);
    }

    function test_settleFinalTabRejectsAmountMismatchBothDirections() public {
        TabySettlement.SettlementTransfer[] memory transfers = _oneTransfer();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundAndApprove(transfers);

        vm.prank(debtorA);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 999_999, block.timestamp + 100, 1);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.AuthorizationAmountMismatch.selector, debtorA, 1_000_000, 999_999)
        );
        settlement.settleFinalTab(payload, transfers);

        vm.prank(debtorA);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_001, block.timestamp + 100, 2);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.AuthorizationAmountMismatch.selector, debtorA, 1_000_000, 1_000_001)
        );
        settlement.settleFinalTab(payload, transfers);
    }

    function test_settleFinalTabRejectsExpiredAuthorizationAndMissingAuthorization() public {
        TabySettlement.SettlementTransfer[] memory transfers = _oneTransfer();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundAndApprove(transfers);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.MissingAuthorization.selector, proposalHash, debtorA));
        settlement.settleFinalTab(payload, transfers);

        vm.prank(debtorA);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, 1_000_000, block.timestamp + 10, 1);
        vm.warp(block.timestamp + 11);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.ExpiredAuthorization.selector, block.timestamp - 1));
        settlement.settleFinalTab(payload, transfers);
    }

    function test_settleFinalTabRejectsPayloadAndTransferMaterialChanges() public {
        TabySettlement.SettlementTransfer[] memory transfers = _twoTransfers();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundApproveAndAuthorize(payload, proposalHash, transfers);

        TabySettlement.FinalTabPayload memory changedPayload = payload;
        changedPayload.totalSettlementAmount = payload.totalSettlementAmount + 1;
        vm.expectRevert();
        settlement.settleFinalTab(changedPayload, transfers);

        TabySettlement.SettlementTransfer[] memory reordered = new TabySettlement.SettlementTransfer[](2);
        reordered[0] = transfers[1];
        reordered[1] = transfers[0];
        reordered[0].orderIndex = 0;
        reordered[1].orderIndex = 1;
        vm.expectRevert();
        settlement.settleFinalTab(payload, reordered);
    }

    function test_settleFinalTabRejectsInvalidTransfersAndTooManyTransfers() public {
        TabySettlement.SettlementTransfer[] memory transfers = new TabySettlement.SettlementTransfer[](0);
        TabySettlement.FinalTabPayload memory payload = _payload(_oneTransfer());
        _register(payload);

        vm.expectRevert(TabySettlement.EmptyTransfers.selector);
        settlement.settleFinalTab(payload, transfers);

        transfers = new TabySettlement.SettlementTransfer[](33);
        for (uint256 i = 0; i < transfers.length; i++) {
            transfers[i] = _transfer("from", "to", address(uint160(0x100 + i)), address(uint160(0x200 + i)), 1, i);
        }
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.TooManyTransfers.selector, 33));
        settlement.settleFinalTab(payload, transfers);

        transfers = _oneTransfer();
        transfers[0].amount = 0;
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settleFinalTab(payload, transfers);

        transfers = _oneTransfer();
        transfers[0].from = address(0);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settleFinalTab(payload, transfers);

        transfers = _oneTransfer();
        transfers[0].to = transfers[0].from;
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settleFinalTab(payload, transfers);
    }

    function test_settleFinalTabRevertsMiddleTransferAndLeavesProposalActiveAndUnsettled() public {
        TabySettlement.SettlementTransfer[] memory transfers = _twoTransfers();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundApproveAndAuthorize(payload, proposalHash, transfers);
        token.setFailOnTransferCall(2);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorB, creditorB, transfers[1].amount)
        );
        settlement.settleFinalTab(payload, transfers);

        assertEq(token.balanceOf(creditorA), 0);
        assertEq(token.balanceOf(creditorB), 0);
        assertFalse(settlement.settledProposalHashes(proposalHash));
        assertEq(settlement.getActiveFinalTab(payload.tabKey).proposalHash, proposalHash);
    }

    function test_settleFinalTabRevertsForInsufficientAllowanceBalanceFalseReturnRevertAndNoReturnSuccess() public {
        TabySettlement.SettlementTransfer[] memory transfers = _oneTransfer();
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);

        vm.prank(debtorA);
        settlement.authorizeFinalTab(payload.tabKey, proposalHash, transfers[0].amount, block.timestamp + 100, 1);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settleFinalTab(payload, transfers);
        assertFalse(settlement.settledProposalHashes(proposalHash));

        _fundAndApprove(transfers);
        token.setFailureMode(MockUsdc.FailureMode.ReturnFalse);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settleFinalTab(payload, transfers);

        token.setFailureMode(MockUsdc.FailureMode.RevertCall);
        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settleFinalTab(payload, transfers);

        token.setFailureMode(MockUsdc.FailureMode.ReturnNothing);
        settlement.settleFinalTab(payload, transfers);
        assertTrue(settlement.settledProposalHashes(proposalHash));
        assertEq(token.balanceOf(creditorA), transfers[0].amount);
    }

    function _settleHappyPath(TabySettlement.SettlementTransfer[] memory transfers) private {
        TabySettlement.FinalTabPayload memory payload = _payload(transfers);
        bytes32 proposalHash = _register(payload);
        _fundApproveAndAuthorize(payload, proposalHash, transfers);
        settlement.settleFinalTab(payload, transfers);
    }

    function _register(TabySettlement.FinalTabPayload memory payload) private returns (bytes32 proposalHash) {
        proposalHash = settlement.hashFinalTabPayloadMemory(payload);
        _register(payload, proposalHash);
    }

    function _register(TabySettlement.FinalTabPayload memory payload, bytes32 proposalHash) private {
        vm.prank(coordinator);
        settlement.registerFinalTab(payload, proposalHash);
    }

    function _fundApproveAndAuthorize(
        TabySettlement.FinalTabPayload memory payload,
        bytes32 proposalHash,
        TabySettlement.SettlementTransfer[] memory transfers
    ) private {
        _fundAndApprove(transfers);

        address[] memory debtors = new address[](transfers.length);
        uint256[] memory totals = new uint256[](transfers.length);
        uint256 debtorCount = 0;

        for (uint256 i = 0; i < transfers.length; i++) {
            bool found = false;
            for (uint256 j = 0; j < debtorCount; j++) {
                if (debtors[j] == transfers[i].from) {
                    totals[j] += transfers[i].amount;
                    found = true;
                    break;
                }
            }
            if (!found) {
                debtors[debtorCount] = transfers[i].from;
                totals[debtorCount] = transfers[i].amount;
                debtorCount++;
            }
        }

        for (uint256 i = 0; i < debtorCount; i++) {
            vm.prank(debtors[i]);
            settlement.authorizeFinalTab(payload.tabKey, proposalHash, totals[i], block.timestamp + 100, i + 1);
        }
    }

    function _fundAndApprove(TabySettlement.SettlementTransfer[] memory transfers) private {
        for (uint256 i = 0; i < transfers.length; i++) {
            token.mint(transfers[i].from, transfers[i].amount + 10_000_000);
        }

        for (uint256 i = 0; i < transfers.length; i++) {
            uint256 approvalAmount = 0;

            for (uint256 j = 0; j < transfers.length; j++) {
                if (transfers[j].from == transfers[i].from) {
                    approvalAmount += transfers[j].amount;
                }
            }

            vm.prank(transfers[i].from);
            token.approve(address(settlement), approvalAmount);
        }
    }

    function _payload(TabySettlement.SettlementTransfer[] memory transfers)
        private
        view
        returns (TabySettlement.FinalTabPayload memory payload)
    {
        bytes32 tabKey = settlement.deriveTabKey(coordinator, APPLICATION_TAB_ID_HASH);
        payload = TabySettlement.FinalTabPayload({
            schemaVersion: 1,
            applicationTabIdHash: APPLICATION_TAB_ID_HASH,
            tabKey: tabKey,
            coordinator: coordinator,
            proposalVersion: 1,
            chainId: 421614,
            token: address(token),
            settlementContract: address(settlement),
            expiresAt: block.timestamp + 1 days,
            includedExpensesHash: INCLUDED_HASH,
            excludedExpensesHash: EXCLUDED_HASH,
            transfersHash: settlement.hashTransfers(transfers),
            totalSettlementAmount: _sum(transfers)
        });
    }

    function _oneTransfer() private view returns (TabySettlement.SettlementTransfer[] memory transfers) {
        transfers = new TabySettlement.SettlementTransfer[](1);
        transfers[0] = _transfer("member-a", "member-c", debtorA, creditorA, 1_000_000, 0);
    }

    function _twoTransfers() private view returns (TabySettlement.SettlementTransfer[] memory transfers) {
        transfers = new TabySettlement.SettlementTransfer[](2);
        transfers[0] = _transfer("member-a", "member-c", debtorA, creditorA, 12_500_000, 0);
        transfers[1] = _transfer("member-b", "member-d", debtorB, creditorB, 3_000_000, 1);
    }

    function _transfer(
        string memory fromMemberId,
        string memory toMemberId,
        address from,
        address to,
        uint256 amount,
        uint256 orderIndex
    ) private pure returns (TabySettlement.SettlementTransfer memory) {
        return TabySettlement.SettlementTransfer({
            fromMemberIdHash: keccak256(bytes(fromMemberId)),
            toMemberIdHash: keccak256(bytes(toMemberId)),
            from: from,
            to: to,
            amount: amount,
            orderIndex: orderIndex
        });
    }

    function _sum(TabySettlement.SettlementTransfer[] memory transfers) private pure returns (uint256 total) {
        for (uint256 i = 0; i < transfers.length; i++) {
            total += transfers[i].amount;
        }
    }

    function _vectorPayload(uint256 firstTransferAmount, uint256 secondTransferAmount, uint256 proposalVersion)
        private
        view
        returns (TabySettlement.FinalTabPayload memory)
    {
        address debtorBWallet = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;
        address debtorCWallet = 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC;
        address settlementContractAddress = 0x2222222222222222222222222222222222222222;
        bytes32 tabKey = keccak256(abi.encode(coordinator, APPLICATION_TAB_ID_HASH));

        return TabySettlement.FinalTabPayload({
            schemaVersion: 1,
            applicationTabIdHash: APPLICATION_TAB_ID_HASH,
            tabKey: tabKey,
            coordinator: coordinator,
            proposalVersion: proposalVersion,
            chainId: 421614,
            token: ARBITRUM_SEPOLIA_USDC,
            settlementContract: settlementContractAddress,
            expiresAt: 1_783_771_200,
            includedExpensesHash: INCLUDED_HASH,
            excludedExpensesHash: EXCLUDED_HASH,
            transfersHash: _vectorTransfersHash(firstTransferAmount, secondTransferAmount, debtorBWallet, debtorCWallet),
            totalSettlementAmount: 14_000_000
        });
    }

    function _vectorTransfers(uint256 firstTransferAmount, uint256 secondTransferAmount)
        private
        view
        returns (TabySettlement.SettlementTransfer[] memory transfers)
    {
        transfers = new TabySettlement.SettlementTransfer[](2);
        transfers[0] = TabySettlement.SettlementTransfer({
            fromMemberIdHash: keccak256(bytes("00000000-0000-4000-8000-000000000002")),
            toMemberIdHash: keccak256(bytes("00000000-0000-4000-8000-000000000001")),
            from: 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB,
            to: coordinator,
            amount: firstTransferAmount,
            orderIndex: 0
        });
        transfers[1] = TabySettlement.SettlementTransfer({
            fromMemberIdHash: keccak256(bytes("00000000-0000-4000-8000-000000000003")),
            toMemberIdHash: keccak256(bytes("00000000-0000-4000-8000-000000000001")),
            from: 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC,
            to: coordinator,
            amount: secondTransferAmount,
            orderIndex: 1
        });
    }

    function _vectorTransfersHash(
        uint256 firstTransferAmount,
        uint256 secondTransferAmount,
        address debtorBWallet,
        address debtorCWallet
    ) private view returns (bytes32) {
        bytes32[] memory transferHashes = new bytes32[](2);
        transferHashes[0] = keccak256(
            abi.encode(
                keccak256(bytes("00000000-0000-4000-8000-000000000002")),
                keccak256(bytes("00000000-0000-4000-8000-000000000001")),
                firstTransferAmount,
                debtorBWallet,
                coordinator,
                uint256(0)
            )
        );
        transferHashes[1] = keccak256(
            abi.encode(
                keccak256(bytes("00000000-0000-4000-8000-000000000003")),
                keccak256(bytes("00000000-0000-4000-8000-000000000001")),
                secondTransferAmount,
                debtorCWallet,
                coordinator,
                uint256(1)
            )
        );

        return keccak256(abi.encode(transferHashes));
    }
}
