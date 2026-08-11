import Foundation

/// StorySitting is deliberately pay-for-result. Every sitting begins with a $5
/// Story Start; the sponsor decides whether to pay $79 only after seeing a preview.
/// There is no subscription or recurring entitlement.
public enum StoryPurchase: String, Codable, CaseIterable, Hashable, Sendable {
    case storyStart
    case keepResult

    public var productID: String {
        switch self {
        case .storyStart: return "com.amflimited.storysitting.story.start"
        case .keepResult: return "com.amflimited.storysitting.result.keep"
        }
    }

    public var priceCents: Int {
        switch self {
        case .storyStart: return 500
        case .keepResult: return 7_900
        }
    }

    public var displayPrice: String {
        switch self {
        case .storyStart: return "$5"
        case .keepResult: return "$79"
        }
    }

    public var title: String {
        switch self {
        case .storyStart: return "Story Start"
        case .keepResult: return "Keep this story result"
        }
    }

    public var detail: String {
        switch self {
        case .storyStart:
            return "Opens one sitting with a Family Pass. A response requests a separate managed human permission check; neither one grants permission for an AI call."
        case .keepResult:
            return "Optional after preview: keep the complete recording and chapter, portable family copy, and one factual correction pass. The preview is a representative passage, not a weak teaser."
        }
    }
}

/// Backend-created before StoreKit opens. The UUID becomes StoreKit's
/// `appAccountToken`, binding a repeatable consumable to one family/project intent.
public struct PurchaseIntentRequest: Codable, Equatable, Sendable {
    public var purchase: StoryPurchase
    public var projectID: String
    public var chapterID: String?
    public var selectedQuestionIDs: [String]
    /// Required for Story Start, but explicitly not storyteller permission.
    public var sponsorAcknowledgedHandshake: Bool

    public init(
        purchase: StoryPurchase,
        projectID: String,
        chapterID: String? = nil,
        selectedQuestionIDs: [String] = [],
        sponsorAcknowledgedHandshake: Bool = false
    ) {
        self.purchase = purchase
        self.projectID = projectID
        self.chapterID = chapterID
        self.selectedQuestionIDs = selectedQuestionIDs
        self.sponsorAcknowledgedHandshake = sponsorAcknowledgedHandshake
    }
}

public struct PurchaseIntent: Codable, Equatable, Identifiable, Sendable {
    public enum Status: String, Codable, Sendable { case pending, fulfilled }

    public let id: String
    public let appAccountToken: UUID
    public let request: PurchaseIntentRequest
    public let createdAt: Date
    public var status: Status
    public var fulfilledTransactionID: UInt64?

    public init(
        id: String,
        appAccountToken: UUID,
        request: PurchaseIntentRequest,
        createdAt: Date,
        status: Status = .pending,
        fulfilledTransactionID: UInt64? = nil
    ) {
        self.id = id
        self.appAccountToken = appAccountToken
        self.request = request
        self.createdAt = createdAt
        self.status = status
        self.fulfilledTransactionID = fulfilledTransactionID
    }

    public var purchase: StoryPurchase { request.purchase }
    public var projectID: String { request.projectID }
}

/// StoreKit verification evidence sent to the backend. Production must verify the
/// signed JWS with Apple and compare every field to its stored purchase intent.
/// StoreKit identifiers remain `UInt64` in-process, but encode as decimal strings
/// so JSON clients cannot silently round values above JavaScript's safe integer.
public struct VerifiedPurchasePayload: Codable, Equatable, Identifiable, Sendable {
    public var id: UInt64 { transactionID }
    public let transactionID: UInt64
    public let originalTransactionID: UInt64
    public let productID: String
    public let appAccountToken: UUID
    public let signedTransactionJWS: String

    public init(
        transactionID: UInt64,
        originalTransactionID: UInt64,
        productID: String,
        appAccountToken: UUID,
        signedTransactionJWS: String
    ) {
        self.transactionID = transactionID
        self.originalTransactionID = originalTransactionID
        self.productID = productID
        self.appAccountToken = appAccountToken
        self.signedTransactionJWS = signedTransactionJWS
    }

    private enum CodingKeys: String, CodingKey {
        case transactionID
        case originalTransactionID
        case productID
        case appAccountToken
        case signedTransactionJWS
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        transactionID = try Self.decodeTransactionID(forKey: .transactionID, from: container)
        originalTransactionID = try Self.decodeTransactionID(forKey: .originalTransactionID, from: container)
        productID = try container.decode(String.self, forKey: .productID)
        appAccountToken = try container.decode(UUID.self, forKey: .appAccountToken)
        signedTransactionJWS = try container.decode(String.self, forKey: .signedTransactionJWS)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(String(transactionID), forKey: .transactionID)
        try container.encode(String(originalTransactionID), forKey: .originalTransactionID)
        try container.encode(productID, forKey: .productID)
        try container.encode(appAccountToken, forKey: .appAccountToken)
        try container.encode(signedTransactionJWS, forKey: .signedTransactionJWS)
    }

    private static func decodeTransactionID(
        forKey key: CodingKeys,
        from container: KeyedDecodingContainer<CodingKeys>
    ) throws -> UInt64 {
        let decimal = try container.decode(String.self, forKey: key)
        guard let value = UInt64(decimal), String(value) == decimal else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription: "StoreKit transaction identifiers must be canonical unsigned decimal strings."
            )
        }
        return value
    }
}
