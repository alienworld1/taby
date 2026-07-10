// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TabySettlement {
    struct FinalTabPayload {
        uint256 schemaVersion;
        bytes32 applicationTabIdHash;
        bytes32 tabKey;
        address coordinator;
        uint256 proposalVersion;
        uint256 chainId;
        address token;
        address settlementContract;
        uint256 expiresAt;
        bytes32 includedExpensesHash;
        bytes32 excludedExpensesHash;
        bytes32 transfersHash;
        uint256 totalSettlementAmount;
    }

    struct SettlementTransfer {
        bytes32 fromMemberIdHash;
        bytes32 toMemberIdHash;
        address from;
        address to;
        uint256 amount;
        uint256 orderIndex;
    }

    struct ActiveFinalTab {
        address coordinator;
        bytes32 applicationTabIdHash;
        bytes32 proposalHash;
        uint256 expiresAt;
        uint256 registeredAt;
        uint256 totalSettlementAmount;
    }

    struct FinalTabAuthorization {
        bytes32 proposalHash;
        address debtor;
        uint256 amount;
        uint256 expiresAt;
        uint256 nonce;
        bool revoked;
        uint256 authorizedAt;
    }

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

    error ZeroSupportedToken();
    error InvalidCoordinator();
    error ZeroApplicationTabIdHash();
    error ZeroTabKey();
    error ZeroProposalHash();
    error UnsupportedChain(uint256 chainId);
    error UnsupportedToken(address token);
    error WrongSettlementContract(address settlementContract);
    error ExpiredFinalTab(uint256 expiresAt);
    error ExpiredAuthorization(uint256 expiresAt);
    error InvalidExpiryRelationship();
    error InvalidProposalHash(bytes32 expected, bytes32 actual);
    error InvalidTransfer(uint256 index);
    error TooManyTransfers(uint256 count);
    error EmptyTransfers();
    error ActiveProposalAlreadyExists(bytes32 tabKey, bytes32 proposalHash);
    error NoActiveProposal(bytes32 tabKey);
    error CallerIsNotCoordinator(address caller, address coordinator);
    error ProposalAlreadyCancelled(bytes32 proposalHash);
    error ProposalAlreadySettled(bytes32 proposalHash);
    error NonceAlreadyUsed(bytes32 proposalHash, address debtor, uint256 nonce);
    error MissingAuthorization(bytes32 proposalHash, address debtor);
    error AuthorizationAmountMismatch(address debtor, uint256 expected, uint256 actual);
    error AuthorizationRevoked(bytes32 proposalHash, address debtor);
    error TransferHashMismatch(bytes32 expected, bytes32 actual);
    error TotalAmountMismatch(uint256 expected, uint256 actual);
    error TransferFailed(address from, address to, uint256 amount);

    uint256 public constant MAX_TRANSFERS = 32;
    uint256 public constant SUPPORTED_CHAIN_ID = 421614;
    uint256 public constant FINAL_TAB_SCHEMA_VERSION = 1;

    address public immutable supportedToken;

    mapping(bytes32 => ActiveFinalTab) private activeFinalTabs;
    mapping(bytes32 => bool) public cancelledProposalHashes;
    mapping(bytes32 => bool) public settledProposalHashes;
    mapping(bytes32 => mapping(address => FinalTabAuthorization)) private authorizations;
    mapping(bytes32 => mapping(address => mapping(uint256 => bool))) public nonceConsumed;

    constructor(address supportedToken_) {
        if (supportedToken_ == address(0)) {
            revert ZeroSupportedToken();
        }

        supportedToken = supportedToken_;
    }

    function registerFinalTab(FinalTabPayload calldata payload, bytes32 proposalHash) external {
        _validatePayload(payload);

        if (payload.coordinator != msg.sender) {
            revert CallerIsNotCoordinator(msg.sender, payload.coordinator);
        }

        if (proposalHash == bytes32(0)) {
            revert ZeroProposalHash();
        }

        bytes32 expectedTabKey = deriveTabKey(msg.sender, payload.applicationTabIdHash);
        if (payload.tabKey != expectedTabKey) {
            revert ZeroTabKey();
        }

        bytes32 recomputedProposalHash = hashFinalTabPayload(payload);
        if (recomputedProposalHash != proposalHash) {
            revert InvalidProposalHash(recomputedProposalHash, proposalHash);
        }

        if (cancelledProposalHashes[proposalHash]) {
            revert ProposalAlreadyCancelled(proposalHash);
        }

        if (settledProposalHashes[proposalHash]) {
            revert ProposalAlreadySettled(proposalHash);
        }

        ActiveFinalTab storage active = activeFinalTabs[payload.tabKey];
        if (active.proposalHash != bytes32(0)) {
            revert ActiveProposalAlreadyExists(payload.tabKey, active.proposalHash);
        }

        activeFinalTabs[payload.tabKey] = ActiveFinalTab({
            coordinator: msg.sender,
            applicationTabIdHash: payload.applicationTabIdHash,
            proposalHash: proposalHash,
            expiresAt: payload.expiresAt,
            registeredAt: block.timestamp,
            totalSettlementAmount: payload.totalSettlementAmount
        });

        emit FinalTabRegistered(
            payload.tabKey,
            payload.applicationTabIdHash,
            proposalHash,
            msg.sender,
            payload.expiresAt,
            payload.totalSettlementAmount
        );
    }

    function cancelFinalTab(bytes32 tabKey, bytes32 proposalHash) external {
        if (tabKey == bytes32(0)) {
            revert ZeroTabKey();
        }
        if (proposalHash == bytes32(0)) {
            revert ZeroProposalHash();
        }

        ActiveFinalTab memory active = activeFinalTabs[tabKey];
        if (active.proposalHash == bytes32(0)) {
            revert NoActiveProposal(tabKey);
        }
        if (active.coordinator != msg.sender) {
            revert CallerIsNotCoordinator(msg.sender, active.coordinator);
        }
        if (active.proposalHash != proposalHash) {
            revert InvalidProposalHash(active.proposalHash, proposalHash);
        }
        if (settledProposalHashes[proposalHash]) {
            revert ProposalAlreadySettled(proposalHash);
        }

        delete activeFinalTabs[tabKey];
        cancelledProposalHashes[proposalHash] = true;

        emit FinalTabCancelled(tabKey, proposalHash, active.coordinator, msg.sender);
    }

    function authorizeFinalTab(
        bytes32 tabKey,
        bytes32 proposalHash,
        uint256 exactAmount,
        uint256 expiresAt,
        uint256 nonce
    ) external {
        if (tabKey == bytes32(0)) {
            revert ZeroTabKey();
        }
        if (proposalHash == bytes32(0)) {
            revert ZeroProposalHash();
        }
        if (exactAmount == 0) {
            revert AuthorizationAmountMismatch(msg.sender, 1, 0);
        }
        if (expiresAt <= block.timestamp) {
            revert ExpiredAuthorization(expiresAt);
        }

        ActiveFinalTab memory active = _requireActive(tabKey, proposalHash);
        if (cancelledProposalHashes[proposalHash]) {
            revert ProposalAlreadyCancelled(proposalHash);
        }
        if (settledProposalHashes[proposalHash]) {
            revert ProposalAlreadySettled(proposalHash);
        }
        if (expiresAt > active.expiresAt) {
            revert InvalidExpiryRelationship();
        }
        if (nonceConsumed[proposalHash][msg.sender][nonce]) {
            revert NonceAlreadyUsed(proposalHash, msg.sender, nonce);
        }

        nonceConsumed[proposalHash][msg.sender][nonce] = true;
        authorizations[proposalHash][msg.sender] = FinalTabAuthorization({
            proposalHash: proposalHash,
            debtor: msg.sender,
            amount: exactAmount,
            expiresAt: expiresAt,
            nonce: nonce,
            revoked: false,
            authorizedAt: block.timestamp
        });

        emit FinalTabAuthorized(tabKey, proposalHash, msg.sender, exactAmount, expiresAt, nonce);
    }

    function revokeFinalTab(bytes32 tabKey, bytes32 proposalHash, uint256 nonce) external {
        if (tabKey == bytes32(0)) {
            revert ZeroTabKey();
        }
        if (proposalHash == bytes32(0)) {
            revert ZeroProposalHash();
        }
        if (settledProposalHashes[proposalHash]) {
            revert ProposalAlreadySettled(proposalHash);
        }

        _requireActive(tabKey, proposalHash);

        FinalTabAuthorization storage authorization = authorizations[proposalHash][msg.sender];
        if (authorization.proposalHash != proposalHash || authorization.nonce != nonce) {
            revert MissingAuthorization(proposalHash, msg.sender);
        }

        authorization.revoked = true;

        emit FinalTabAuthorizationRevoked(tabKey, proposalHash, msg.sender, nonce);
    }

    function settleFinalTab(FinalTabPayload calldata payload, SettlementTransfer[] calldata transfers) external {
        _validatePayload(payload);

        if (transfers.length == 0) {
            revert EmptyTransfers();
        }
        if (transfers.length > MAX_TRANSFERS) {
            revert TooManyTransfers(transfers.length);
        }

        bytes32 recomputedProposalHash = hashFinalTabPayload(payload);
        ActiveFinalTab memory active = _requireActive(payload.tabKey, recomputedProposalHash);

        if (cancelledProposalHashes[recomputedProposalHash]) {
            revert ProposalAlreadyCancelled(recomputedProposalHash);
        }
        if (settledProposalHashes[recomputedProposalHash]) {
            revert ProposalAlreadySettled(recomputedProposalHash);
        }
        if (active.expiresAt <= block.timestamp) {
            revert ExpiredFinalTab(active.expiresAt);
        }

        (uint256 totalAmount, bytes32 transfersHash) = _validateAndHashTransfers(transfers);
        if (transfersHash != payload.transfersHash) {
            revert TransferHashMismatch(payload.transfersHash, transfersHash);
        }
        if (totalAmount != payload.totalSettlementAmount) {
            revert TotalAmountMismatch(payload.totalSettlementAmount, totalAmount);
        }

        address[] memory debtors = new address[](transfers.length);
        uint256[] memory debtorTotals = new uint256[](transfers.length);
        uint256 debtorCount = 0;

        for (uint256 i = 0; i < transfers.length; i++) {
            SettlementTransfer calldata transferItem = transfers[i];
            bool found = false;
            for (uint256 j = 0; j < debtorCount; j++) {
                if (debtors[j] == transferItem.from) {
                    debtorTotals[j] += transferItem.amount;
                    found = true;
                    break;
                }
            }
            if (!found) {
                debtors[debtorCount] = transferItem.from;
                debtorTotals[debtorCount] = transferItem.amount;
                debtorCount++;
            }
        }

        for (uint256 i = 0; i < debtorCount; i++) {
            FinalTabAuthorization memory authorization = authorizations[recomputedProposalHash][debtors[i]];
            if (authorization.proposalHash != recomputedProposalHash || authorization.debtor != debtors[i]) {
                revert MissingAuthorization(recomputedProposalHash, debtors[i]);
            }
            if (authorization.revoked) {
                revert AuthorizationRevoked(recomputedProposalHash, debtors[i]);
            }
            if (authorization.expiresAt <= block.timestamp) {
                revert ExpiredAuthorization(authorization.expiresAt);
            }
            if (authorization.amount != debtorTotals[i]) {
                revert AuthorizationAmountMismatch(debtors[i], debtorTotals[i], authorization.amount);
            }
        }

        for (uint256 i = 0; i < transfers.length; i++) {
            SettlementTransfer calldata transferItem = transfers[i];
            _safeTransferFrom(payload.token, transferItem.from, transferItem.to, transferItem.amount);
        }

        settledProposalHashes[recomputedProposalHash] = true;
        delete activeFinalTabs[payload.tabKey];

        emit FinalTabSettled(
            payload.tabKey,
            recomputedProposalHash,
            msg.sender,
            payload.token,
            totalAmount,
            transfers.length,
            transfersHash
        );
    }

    function getActiveFinalTab(bytes32 tabKey) external view returns (ActiveFinalTab memory) {
        return activeFinalTabs[tabKey];
    }

    function getActiveFinalTab(address coordinator, bytes32 applicationTabIdHash)
        external
        view
        returns (ActiveFinalTab memory)
    {
        return activeFinalTabs[deriveTabKey(coordinator, applicationTabIdHash)];
    }

    function getAuthorization(bytes32 proposalHash, address debtor)
        external
        view
        returns (FinalTabAuthorization memory)
    {
        return authorizations[proposalHash][debtor];
    }

    function isNonceConsumed(bytes32 proposalHash, address debtor, uint256 nonce) external view returns (bool) {
        return nonceConsumed[proposalHash][debtor][nonce];
    }

    function readiness(bytes32 tabKey, bytes32 proposalHash, address[] calldata debtors)
        external
        view
        returns (bool active, bool cancelled, bool settled, bool expired, bool[] memory authorized)
    {
        ActiveFinalTab memory finalTab = activeFinalTabs[tabKey];
        active = finalTab.proposalHash == proposalHash && proposalHash != bytes32(0);
        cancelled = cancelledProposalHashes[proposalHash];
        settled = settledProposalHashes[proposalHash];
        expired = active && finalTab.expiresAt <= block.timestamp;
        authorized = new bool[](debtors.length);

        for (uint256 i = 0; i < debtors.length; i++) {
            FinalTabAuthorization memory authorization = authorizations[proposalHash][debtors[i]];
            authorized[i] = authorization.proposalHash == proposalHash && !authorization.revoked
                && authorization.expiresAt > block.timestamp;
        }
    }

    function deriveTabKey(address coordinator, bytes32 applicationTabIdHash) public pure returns (bytes32) {
        if (coordinator == address(0)) {
            revert InvalidCoordinator();
        }
        if (applicationTabIdHash == bytes32(0)) {
            revert ZeroApplicationTabIdHash();
        }

        return keccak256(abi.encode(coordinator, applicationTabIdHash));
    }

    function hashFinalTabPayload(FinalTabPayload calldata payload) public pure returns (bytes32) {
        return _hashFinalTabPayload(payload);
    }

    function hashFinalTabPayloadMemory(FinalTabPayload memory payload) public pure returns (bytes32) {
        return _hashFinalTabPayload(payload);
    }

    function hashTransfers(SettlementTransfer[] calldata transfers) public pure returns (bytes32) {
        (, bytes32 transfersHash) = _validateAndHashTransfers(transfers);
        return transfersHash;
    }

    function _validatePayload(FinalTabPayload calldata payload) private view {
        if (payload.schemaVersion != FINAL_TAB_SCHEMA_VERSION) {
            revert InvalidProposalHash(bytes32(FINAL_TAB_SCHEMA_VERSION), bytes32(payload.schemaVersion));
        }
        if (payload.coordinator == address(0)) {
            revert InvalidCoordinator();
        }
        if (payload.applicationTabIdHash == bytes32(0)) {
            revert ZeroApplicationTabIdHash();
        }
        if (payload.tabKey == bytes32(0)) {
            revert ZeroTabKey();
        }
        if (payload.chainId != block.chainid || payload.chainId != SUPPORTED_CHAIN_ID) {
            revert UnsupportedChain(payload.chainId);
        }
        if (payload.token != supportedToken) {
            revert UnsupportedToken(payload.token);
        }
        if (payload.settlementContract != address(this)) {
            revert WrongSettlementContract(payload.settlementContract);
        }
        if (payload.expiresAt <= block.timestamp) {
            revert ExpiredFinalTab(payload.expiresAt);
        }
        if (
            payload.includedExpensesHash == bytes32(0) || payload.excludedExpensesHash == bytes32(0)
                || payload.transfersHash == bytes32(0) || payload.totalSettlementAmount == 0
        ) {
            revert InvalidProposalHash(bytes32(0), bytes32(0));
        }
        if (payload.tabKey != deriveTabKey(payload.coordinator, payload.applicationTabIdHash)) {
            revert ZeroTabKey();
        }
    }

    function _requireActive(bytes32 tabKey, bytes32 proposalHash) private view returns (ActiveFinalTab memory active) {
        active = activeFinalTabs[tabKey];
        if (active.proposalHash == bytes32(0)) {
            revert NoActiveProposal(tabKey);
        }
        if (active.proposalHash != proposalHash) {
            revert InvalidProposalHash(active.proposalHash, proposalHash);
        }
    }

    function _hashFinalTabPayload(FinalTabPayload memory payload) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                payload.schemaVersion,
                payload.applicationTabIdHash,
                payload.tabKey,
                payload.coordinator,
                payload.proposalVersion,
                payload.chainId,
                payload.token,
                payload.settlementContract,
                payload.expiresAt,
                payload.includedExpensesHash,
                payload.excludedExpensesHash,
                payload.transfersHash,
                payload.totalSettlementAmount
            )
        );
    }

    function _validateAndHashTransfers(SettlementTransfer[] calldata transfers)
        private
        pure
        returns (uint256 totalAmount, bytes32 transfersHash)
    {
        bytes32[] memory transferHashes = new bytes32[](transfers.length);

        for (uint256 i = 0; i < transfers.length; i++) {
            SettlementTransfer calldata transferItem = transfers[i];

            if (
                transferItem.fromMemberIdHash == bytes32(0) || transferItem.toMemberIdHash == bytes32(0)
                    || transferItem.from == address(0) || transferItem.to == address(0)
                    || transferItem.from == transferItem.to || transferItem.amount == 0 || transferItem.orderIndex != i
            ) {
                revert InvalidTransfer(i);
            }

            totalAmount += transferItem.amount;
            transferHashes[i] = keccak256(
                abi.encode(
                    transferItem.fromMemberIdHash,
                    transferItem.toMemberIdHash,
                    transferItem.amount,
                    transferItem.from,
                    transferItem.to,
                    transferItem.orderIndex
                )
            );
        }

        transfersHash = keccak256(abi.encode(transferHashes));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));

        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed(from, to, amount);
        }
    }
}
