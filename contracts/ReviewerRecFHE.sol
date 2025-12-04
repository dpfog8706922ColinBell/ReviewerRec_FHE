// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReviewerRecFHE is SepoliaConfig {
    struct EncryptedPaper {
        uint256 id;
        euint32 encryptedTitle;
        euint32 encryptedAbstract;
        euint32 encryptedKeywords;
        euint32 encryptedDiscipline;
        uint256 timestamp;
    }

    struct EncryptedReviewer {
        uint256 id;
        euint32 encryptedExpertise;
        euint32 encryptedAffiliation;
        euint32 encryptedPublicationCount;
        euint32 encryptedReviewCount;
    }

    struct MatchResult {
        uint256 paperId;
        uint256 reviewerId;
        euint32 matchScore;
        bool isRevealed;
    }

    uint256 public paperCount;
    uint256 public reviewerCount;
    mapping(uint256 => EncryptedPaper) public encryptedPapers;
    mapping(uint256 => EncryptedReviewer) public encryptedReviewers;
    mapping(uint256 => MatchResult) public matchResults;

    mapping(uint256 => uint256) private requestToPaperId;
    mapping(uint256 => uint256) private requestToReviewerId;

    event PaperSubmitted(uint256 indexed id, uint256 timestamp);
    event ReviewerAdded(uint256 indexed id);
    event MatchingRequested(uint256 indexed paperId);
    event MatchRevealed(uint256 indexed paperId, uint256 indexed reviewerId);

    /// @notice Submit a new encrypted research paper
    function submitEncryptedPaper(
        euint32 encryptedTitle,
        euint32 encryptedAbstract,
        euint32 encryptedKeywords,
        euint32 encryptedDiscipline
    ) public {
        paperCount += 1;
        uint256 newId = paperCount;

        encryptedPapers[newId] = EncryptedPaper({
            id: newId,
            encryptedTitle: encryptedTitle,
            encryptedAbstract: encryptedAbstract,
            encryptedKeywords: encryptedKeywords,
            encryptedDiscipline: encryptedDiscipline,
            timestamp: block.timestamp
        });

        emit PaperSubmitted(newId, block.timestamp);
    }

    /// @notice Add a new encrypted reviewer profile
    function addEncryptedReviewer(
        euint32 encryptedExpertise,
        euint32 encryptedAffiliation,
        euint32 encryptedPublicationCount,
        euint32 encryptedReviewCount
    ) public {
        reviewerCount += 1;
        uint256 newId = reviewerCount;

        encryptedReviewers[newId] = EncryptedReviewer({
            id: newId,
            encryptedExpertise: encryptedExpertise,
            encryptedAffiliation: encryptedAffiliation,
            encryptedPublicationCount: encryptedPublicationCount,
            encryptedReviewCount: encryptedReviewCount
        });

        emit ReviewerAdded(newId);
    }

    /// @notice Request matching reviewers for a paper
    function requestMatchingReviewers(uint256 paperId) public {
        require(paperId <= paperCount, "Invalid paper ID");
        
        EncryptedPaper storage paper = encryptedPapers[paperId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(paper.encryptedTitle);
        ciphertexts[1] = FHE.toBytes32(paper.encryptedAbstract);
        ciphertexts[2] = FHE.toBytes32(paper.encryptedKeywords);
        ciphertexts[3] = FHE.toBytes32(paper.encryptedDiscipline);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.processMatching.selector);
        requestToPaperId[reqId] = paperId;
        
        emit MatchingRequested(paperId);
    }

    /// @notice Process matching results
    function processMatching(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 paperId = requestToPaperId[requestId];
        require(paperId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory paperData = abi.decode(cleartexts, (string[]));
        
        // In a real implementation, perform encrypted matching with reviewers
        // This is simplified for demonstration
        uint256 bestMatchId = findBestMatch(paperData);
        
        matchResults[paperId] = MatchResult({
            paperId: paperId,
            reviewerId: bestMatchId,
            matchScore: FHE.asEuint32(100), // Simplified score
            isRevealed: false
        });
    }

    /// @notice Reveal the matched reviewer
    function revealMatchedReviewer(uint256 paperId) public {
        MatchResult storage result = matchResults[paperId];
        require(result.paperId != 0, "No match found");
        require(!result.isRevealed, "Already revealed");
        
        EncryptedReviewer storage reviewer = encryptedReviewers[result.reviewerId];
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(result.matchScore);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.finalizeReveal.selector);
        requestToReviewerId[reqId] = paperId;
    }

    /// @notice Finalize the reveal process
    function finalizeReveal(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 paperId = requestToReviewerId[requestId];
        require(paperId != 0, "Invalid request");
        
        MatchResult storage result = matchResults[paperId];
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        result.isRevealed = true;
        emit MatchRevealed(paperId, result.reviewerId);
    }

    // Simplified matching algorithm (in real implementation would use FHE operations)
    function findBestMatch(string[] memory paperData) private view returns (uint256) {
        // This is a placeholder - actual implementation would compare encrypted attributes
        if (reviewerCount > 0) {
            return 1; // Return first reviewer as dummy match
        }
        revert("No reviewers available");
    }
}