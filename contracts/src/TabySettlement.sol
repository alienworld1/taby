// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract TabySettlement {
    struct Transfer {
        address from;
        address to;
        uint256 amount;
    }

    event SettlementRecorded(
        bytes32 indexed tabKey,
        bytes32 indexed proposalHash,
        address indexed executor,
        address token,
        uint256 totalAmount,
        uint256 transferCount,
        bytes32 transferSetHash
    );

    error ZeroSupportedToken();
    error ZeroProposalAuthorizer();
    error UnsupportedToken(address token);
    error EmptyTransfers();
    error TooManyTransfers(uint256 count);
    error InvalidTabKey();
    error InvalidProposalHash();
    error InvalidTransfer(uint256 index);
    error DuplicateTransferPair(uint256 firstIndex, uint256 duplicateIndex);
    error ProposalAlreadySettled(bytes32 proposalKey);
    error InvalidSettlementAuthorization();
    error TransferFailed(address from, address to, uint256 amount);

    uint256 public constant MAX_TRANSFERS = 32;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant SETTLEMENT_AUTHORIZATION_TYPEHASH =
        keccak256("SettlementAuthorization(bytes32 tabKey,bytes32 proposalHash,address token,bytes32 transferSetHash)");
    bytes32 private constant TRANSFER_TYPEHASH = keccak256("Transfer(address from,address to,uint256 amount)");
    bytes32 private constant TRANSFER_SET_TYPEHASH = keccak256("TransferSet(address token,bytes32 transfersHash)");
    bytes32 private constant NAME_HASH = keccak256("TabySettlement");
    bytes32 private constant VERSION_HASH = keccak256("1");

    address public immutable supportedToken;
    address public immutable proposalAuthorizer;
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(bytes32 => bool) public settledProposals;

    constructor(address supportedToken_, address proposalAuthorizer_) {
        if (supportedToken_ == address(0)) {
            revert ZeroSupportedToken();
        }

        if (proposalAuthorizer_ == address(0)) {
            revert ZeroProposalAuthorizer();
        }

        supportedToken = supportedToken_;
        proposalAuthorizer = proposalAuthorizer_;
        DOMAIN_SEPARATOR =
            keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function settle(
        bytes32 tabKey,
        bytes32 proposalHash,
        address token,
        Transfer[] calldata transfers,
        bytes calldata authorization
    ) external {
        if (tabKey == bytes32(0)) {
            revert InvalidTabKey();
        }

        if (proposalHash == bytes32(0)) {
            revert InvalidProposalHash();
        }

        if (token != supportedToken) {
            revert UnsupportedToken(token);
        }

        if (transfers.length == 0) {
            revert EmptyTransfers();
        }

        if (transfers.length > MAX_TRANSFERS) {
            revert TooManyTransfers(transfers.length);
        }

        (uint256 totalAmount, bytes32 transferSetHash) = _validateAndHashTransfers(token, transfers);

        if (!_isAuthorized(tabKey, proposalHash, token, transferSetHash, authorization)) {
            revert InvalidSettlementAuthorization();
        }

        bytes32 key = proposalKey(tabKey, proposalHash);
        if (settledProposals[key]) {
            revert ProposalAlreadySettled(key);
        }

        settledProposals[key] = true;

        for (uint256 i = 0; i < transfers.length; i++) {
            Transfer calldata transferItem = transfers[i];
            _safeTransferFrom(token, transferItem.from, transferItem.to, transferItem.amount);
        }

        emit SettlementRecorded(tabKey, proposalHash, msg.sender, token, totalAmount, transfers.length, transferSetHash);
    }

    function proposalKey(bytes32 tabKey, bytes32 proposalHash) public pure returns (bytes32) {
        return keccak256(abi.encode(tabKey, proposalHash));
    }

    function hashAuthorization(bytes32 tabKey, bytes32 proposalHash, address token, bytes32 transferSetHash)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(SETTLEMENT_AUTHORIZATION_TYPEHASH, tabKey, proposalHash, token, transferSetHash));

        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function hashTransferSet(address token, Transfer[] calldata transfers) public pure returns (bytes32) {
        bytes32[] memory transferHashes = new bytes32[](transfers.length);

        for (uint256 i = 0; i < transfers.length; i++) {
            transferHashes[i] =
                keccak256(abi.encode(TRANSFER_TYPEHASH, transfers[i].from, transfers[i].to, transfers[i].amount));
        }

        return keccak256(abi.encode(TRANSFER_SET_TYPEHASH, token, keccak256(abi.encodePacked(transferHashes))));
    }

    function _validateAndHashTransfers(address token, Transfer[] calldata transfers)
        private
        pure
        returns (uint256 totalAmount, bytes32 transferSetHash)
    {
        for (uint256 i = 0; i < transfers.length; i++) {
            Transfer calldata transferItem = transfers[i];

            if (
                transferItem.from == address(0) || transferItem.to == address(0) || transferItem.from == transferItem.to
                    || transferItem.amount == 0
            ) {
                revert InvalidTransfer(i);
            }

            for (uint256 j = 0; j < i; j++) {
                if (transfers[j].from == transferItem.from && transfers[j].to == transferItem.to) {
                    revert DuplicateTransferPair(j, i);
                }
            }

            totalAmount += transferItem.amount;
        }

        transferSetHash = hashTransferSet(token, transfers);
    }

    function _isAuthorized(
        bytes32 tabKey,
        bytes32 proposalHash,
        address token,
        bytes32 transferSetHash,
        bytes calldata authorization
    ) private view returns (bool) {
        if (authorization.length != 65) {
            return false;
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(authorization.offset)
            s := calldataload(add(authorization.offset, 32))
            v := byte(0, calldataload(add(authorization.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            return false;
        }

        address recovered = ecrecover(hashAuthorization(tabKey, proposalHash, token, transferSetHash), v, r, s);
        return recovered == proposalAuthorizer;
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(bytes4(0x23b872dd), from, to, amount));

        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed(from, to, amount);
        }
    }
}
