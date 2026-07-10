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

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failureMode == FailureMode.RevertCall) {
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
    event SettlementRecorded(
        bytes32 indexed tabKey,
        bytes32 indexed proposalHash,
        address indexed executor,
        address token,
        uint256 totalAmount,
        uint256 transferCount,
        bytes32 transferSetHash
    );

    uint256 private constant AUTHORER_PRIVATE_KEY = 0xA11CE;
    bytes32 private constant TAB_KEY = keccak256("taby-tab");
    bytes32 private constant PROPOSAL_HASH = keccak256("proposal");

    MockUsdc private token;
    TabySettlement private settlement;
    address private proposalAuthorizer;
    address private debtorA = address(0xA1);
    address private debtorB = address(0xB1);
    address private creditorA = address(0xC1);
    address private creditorB = address(0xC2);

    bytes32 private constant FINAL_TAB_VECTOR_HASH =
        0xbce86c4312bb1677def3be989993ecbdaff3ee18966426fd0dbd4c0b5269a7cb;
    bytes32 private constant FINAL_TAB_INCLUDED_HASH =
        0xacb371cd6d4dcd71a67a09d04888d4c6b37180b0bef96be428225fb69c9ce63b;
    bytes32 private constant FINAL_TAB_EXCLUDED_HASH =
        0x92fd7ed3639a058a3940e1a80c61e19cc9edcc6401f18baa8fa45a113d1eddbf;
    bytes32 private constant FINAL_TAB_TRANSFERS_HASH =
        0x203cb1d323e5c7e230ee43da6dfcfa508c4a7ddb11346d4c50b477b643008467;

    function setUp() public {
        proposalAuthorizer = vm.addr(AUTHORER_PRIVATE_KEY);
        token = new MockUsdc();
        settlement = new TabySettlement(address(token), proposalAuthorizer);
    }

    function test_constructorRejectsZeroToken() public {
        vm.expectRevert(TabySettlement.ZeroSupportedToken.selector);
        new TabySettlement(address(0), proposalAuthorizer);
    }

    function test_constructorRejectsZeroAuthorizer() public {
        vm.expectRevert(TabySettlement.ZeroProposalAuthorizer.selector);
        new TabySettlement(address(token), address(0));
    }

    function test_finalTabHashVectorMatchesTypeScript() public pure {
        assertEq(_vectorProposalHash(4_000_000, 10_000_000, 1), FINAL_TAB_VECTOR_HASH);
        assertEq(_vectorIncludedHash(0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d), FINAL_TAB_INCLUDED_HASH);
        assertEq(_vectorExcludedHash(), FINAL_TAB_EXCLUDED_HASH);
        assertEq(
            _vectorTransfersHash(
                4_000_000,
                10_000_000,
                0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa,
                0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB,
                0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC
            ),
            FINAL_TAB_TRANSFERS_HASH
        );
    }

    function test_finalTabHashVectorChangesForMaterialFields() public pure {
        bytes32 proposalHash = _vectorProposalHash(4_000_000, 10_000_000, 1);
        bytes32 changedAmount = _vectorProposalHash(4_000_001, 10_000_000, 1);
        bytes32 changedVersion = _vectorProposalHash(4_000_000, 10_000_000, 2);

        assertEq(proposalHash, FINAL_TAB_VECTOR_HASH);
        assertNotEq(changedAmount, proposalHash);
        assertNotEq(changedVersion, proposalHash);
    }

    function test_settleTransfersFundsAndEmitsSettlementEvent() public {
        TabySettlement.Transfer[] memory transfers = _twoTransfers();
        _fundAndApprove(transfers);

        bytes32 transferSetHash = _hashTransferSet(transfers);
        bytes memory authorization = _authorization(transfers);

        vm.expectEmit(true, true, true, true);
        emit SettlementRecorded(TAB_KEY, PROPOSAL_HASH, address(this), address(token), 15_500_000, 2, transferSetHash);

        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        assertEq(token.balanceOf(debtorA), 10_000_000);
        assertEq(token.balanceOf(debtorB), 10_000_000);
        assertEq(token.balanceOf(creditorA), 12_500_000);
        assertEq(token.balanceOf(creditorB), 3_000_000);
        assertTrue(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
    }

    function test_settleAllowsMultipleTransfersFromOneDebtorToDifferentCreditors() public {
        TabySettlement.Transfer[] memory transfers = new TabySettlement.Transfer[](2);
        transfers[0] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 2_000_000});
        transfers[1] = TabySettlement.Transfer({from: debtorA, to: creditorB, amount: 3_000_000});
        _fundAndApprove(transfers);

        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, _authorization(transfers));

        assertEq(token.balanceOf(debtorA), 20_000_000);
        assertEq(token.balanceOf(creditorA), 2_000_000);
        assertEq(token.balanceOf(creditorB), 3_000_000);
    }

    function test_settleAllowsMultipleDebtorsPayingOneCreditor() public {
        TabySettlement.Transfer[] memory transfers = new TabySettlement.Transfer[](2);
        transfers[0] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 2_000_000});
        transfers[1] = TabySettlement.Transfer({from: debtorB, to: creditorA, amount: 3_000_000});
        _fundAndApprove(transfers);

        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, _authorization(transfers));

        assertEq(token.balanceOf(creditorA), 5_000_000);
    }

    function test_settleRejectsDuplicateSettlement() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        _fundAndApprove(transfers);
        bytes memory authorization = _authorization(transfers);

        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        bytes32 key = settlement.proposalKey(TAB_KEY, PROPOSAL_HASH);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.ProposalAlreadySettled.selector, key));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);
    }

    function test_settleRejectsWrongToken() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.UnsupportedToken.selector, address(0xDEAD)));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(0xDEAD), transfers, authorization);
    }

    function test_settleRejectsEmptyTransfers() public {
        TabySettlement.Transfer[] memory transfers = new TabySettlement.Transfer[](0);

        vm.expectRevert(TabySettlement.EmptyTransfers.selector);
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsTooManyTransfers() public {
        TabySettlement.Transfer[] memory transfers = new TabySettlement.Transfer[](33);

        for (uint256 i = 0; i < transfers.length; i++) {
            transfers[i] = TabySettlement.Transfer({
                from: address(uint160(0x1000 + i)),
                to: address(uint160(0x2000 + i)),
                amount: 1
            });
        }

        bytes memory authorization = _authorization(transfers);
        vm.expectRevert(abi.encodeWithSelector(TabySettlement.TooManyTransfers.selector, 33));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);
    }

    function test_settleRejectsZeroTabKey() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(TabySettlement.InvalidTabKey.selector);
        settlement.settle(bytes32(0), PROPOSAL_HASH, address(token), transfers, authorization);
    }

    function test_settleRejectsZeroProposalHash() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(TabySettlement.InvalidProposalHash.selector);
        settlement.settle(TAB_KEY, bytes32(0), address(token), transfers, authorization);
    }

    function test_settleRejectsZeroAmount() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        transfers[0].amount = 0;

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsZeroDebtor() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        transfers[0].from = address(0);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsZeroCreditor() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        transfers[0].to = address(0);

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsSameDebtorAndCreditor() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        transfers[0].to = transfers[0].from;

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.InvalidTransfer.selector, 0));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsDuplicatePair() public {
        TabySettlement.Transfer[] memory transfers = new TabySettlement.Transfer[](2);
        transfers[0] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 1});
        transfers[1] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 2});

        vm.expectRevert(abi.encodeWithSelector(TabySettlement.DuplicateTransferPair.selector, 0, 1));
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");
    }

    function test_settleRejectsInvalidAuthorization() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        _fundAndApprove(transfers);

        vm.expectRevert(TabySettlement.InvalidSettlementAuthorization.selector);
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, "");

        assertFalse(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
    }

    function test_settleRejectsReplayedAuthorizationForChangedTransfer() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        bytes memory authorization = _authorization(transfers);
        transfers[0].amount = 2_000_000;
        _fundAndApprove(transfers);

        vm.expectRevert(TabySettlement.InvalidSettlementAuthorization.selector);
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);
    }

    function test_settleRevertsForInsufficientAllowanceAndLeavesProposalUnsettled() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        token.mint(debtorA, transfers[0].amount);
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        assertFalse(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
        assertEq(token.balanceOf(debtorA), transfers[0].amount);
        assertEq(token.balanceOf(creditorA), 0);
    }

    function test_settleRevertsForInsufficientBalanceAndLeavesProposalUnsettled() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        vm.prank(debtorA);
        token.approve(address(settlement), transfers[0].amount);
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        assertFalse(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
        assertEq(token.balanceOf(creditorA), 0);
    }

    function test_settleRevertsWhenTokenReturnsFalseAndLeavesProposalUnsettled() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        _fundAndApprove(transfers);
        token.setFailureMode(MockUsdc.FailureMode.ReturnFalse);
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        assertFalse(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
    }

    function test_settleRevertsWhenTokenCallRevertsAndLeavesProposalUnsettled() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        _fundAndApprove(transfers);
        token.setFailureMode(MockUsdc.FailureMode.RevertCall);
        bytes memory authorization = _authorization(transfers);

        vm.expectRevert(
            abi.encodeWithSelector(TabySettlement.TransferFailed.selector, debtorA, creditorA, transfers[0].amount)
        );
        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, authorization);

        assertFalse(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
    }

    function test_settleAcceptsTokenWithNoReturnData() public {
        TabySettlement.Transfer[] memory transfers = _oneTransfer();
        _fundAndApprove(transfers);
        token.setFailureMode(MockUsdc.FailureMode.ReturnNothing);

        settlement.settle(TAB_KEY, PROPOSAL_HASH, address(token), transfers, _authorization(transfers));

        assertTrue(settlement.settledProposals(settlement.proposalKey(TAB_KEY, PROPOSAL_HASH)));
        assertEq(token.balanceOf(creditorA), transfers[0].amount);
    }

    function _vectorProposalHash(uint256 firstTransferAmount, uint256 secondTransferAmount, uint256 proposalVersion)
        private
        pure
        returns (bytes32)
    {
        address coordinator = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
        address debtorBWallet = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;
        address debtorCWallet = 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC;
        address tokenAddress = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
        address settlementContractAddress = 0x2222222222222222222222222222222222222222;
        bytes32 tabIdHash = _idHash("11111111-1111-4111-8111-111111111111");

        return keccak256(
            abi.encode(
                uint256(1),
                tabIdHash,
                keccak256(abi.encode(coordinator, tabIdHash)),
                coordinator,
                proposalVersion,
                uint256(421614),
                tokenAddress,
                settlementContractAddress,
                uint256(1_783_771_200),
                _vectorIncludedHash(tokenAddress),
                _vectorExcludedHash(),
                _vectorTransfersHash(firstTransferAmount, secondTransferAmount, coordinator, debtorBWallet, debtorCWallet),
                uint256(14_000_000)
            )
        );
    }

    function _vectorIncludedHash(address tokenAddress) private pure returns (bytes32) {
        bytes32[] memory expenseHashes = new bytes32[](2);
        bytes32[] memory firstSplits = new bytes32[](3);
        bytes32[] memory secondSplits = new bytes32[](2);

        firstSplits[0] = _splitHash("00000000-0000-4000-8000-000000000001", 10_000_000);
        firstSplits[1] = _splitHash("00000000-0000-4000-8000-000000000002", 10_000_000);
        firstSplits[2] = _splitHash("00000000-0000-4000-8000-000000000003", 10_000_000);
        secondSplits[0] = _splitHash("00000000-0000-4000-8000-000000000001", 6_000_000);
        secondSplits[1] = _splitHash("00000000-0000-4000-8000-000000000002", 6_000_000);

        expenseHashes[0] = keccak256(
            abi.encode(
                _idHash("10000000-0000-4000-8000-000000000001"),
                _idHash("00000000-0000-4000-8000-000000000001"),
                uint256(30_000_000),
                tokenAddress,
                keccak256(abi.encode(firstSplits))
            )
        );
        expenseHashes[1] = keccak256(
            abi.encode(
                _idHash("10000000-0000-4000-8000-000000000002"),
                _idHash("00000000-0000-4000-8000-000000000002"),
                uint256(12_000_000),
                tokenAddress,
                keccak256(abi.encode(secondSplits))
            )
        );

        return keccak256(abi.encode(expenseHashes));
    }

    function _vectorExcludedHash() private pure returns (bytes32) {
        bytes32[] memory expenseHashes = new bytes32[](1);
        expenseHashes[0] = keccak256(
            abi.encode(_idHash("10000000-0000-4000-8000-000000000003"), _idHash("pending"))
        );

        return keccak256(abi.encode(expenseHashes));
    }

    function _vectorTransfersHash(
        uint256 firstTransferAmount,
        uint256 secondTransferAmount,
        address coordinator,
        address debtorBWallet,
        address debtorCWallet
    ) private pure returns (bytes32) {
        bytes32[] memory transferHashes = new bytes32[](2);
        transferHashes[0] = keccak256(
            abi.encode(
                _idHash("00000000-0000-4000-8000-000000000002"),
                _idHash("00000000-0000-4000-8000-000000000001"),
                firstTransferAmount,
                debtorBWallet,
                coordinator,
                uint256(0)
            )
        );
        transferHashes[1] = keccak256(
            abi.encode(
                _idHash("00000000-0000-4000-8000-000000000003"),
                _idHash("00000000-0000-4000-8000-000000000001"),
                secondTransferAmount,
                debtorCWallet,
                coordinator,
                uint256(1)
            )
        );

        return keccak256(abi.encode(transferHashes));
    }

    function _splitHash(string memory memberId, uint256 shareBaseUnits) private pure returns (bytes32) {
        return keccak256(abi.encode(_idHash(memberId), shareBaseUnits));
    }

    function _idHash(string memory value) private pure returns (bytes32) {
        return keccak256(bytes(value));
    }

    function _oneTransfer() private view returns (TabySettlement.Transfer[] memory transfers) {
        transfers = new TabySettlement.Transfer[](1);
        transfers[0] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 1_000_000});
    }

    function _twoTransfers() private view returns (TabySettlement.Transfer[] memory transfers) {
        transfers = new TabySettlement.Transfer[](2);
        transfers[0] = TabySettlement.Transfer({from: debtorA, to: creditorA, amount: 12_500_000});
        transfers[1] = TabySettlement.Transfer({from: debtorB, to: creditorB, amount: 3_000_000});
    }

    function _fundAndApprove(TabySettlement.Transfer[] memory transfers) private {
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

    function _authorization(TabySettlement.Transfer[] memory transfers) private view returns (bytes memory) {
        bytes32 digest =
            settlement.hashAuthorization(TAB_KEY, PROPOSAL_HASH, address(token), _hashTransferSet(transfers));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORER_PRIVATE_KEY, digest);

        return abi.encodePacked(r, s, v);
    }

    function _hashTransferSet(TabySettlement.Transfer[] memory transfers) private view returns (bytes32) {
        return settlement.hashTransferSet(address(token), transfers);
    }
}
