import Foundation

public enum ResultEdition: String, Codable, CaseIterable, Hashable, Sendable {
    case voice
    case story
    case heirloom

    public var title: String {
        switch self {
        case .voice: return "Voice Edition"
        case .story: return "Story Edition"
        case .heirloom: return "Heirloom Edition"
        }
    }

    public var layer: String {
        switch self {
        case .voice: return "SOURCE"
        case .story: return "NARRATIVE"
        case .heirloom: return "HEIRLOOM"
        }
    }

    public var priceCents: Int {
        switch self {
        case .voice: return 3_900
        case .story: return 7_900
        case .heirloom: return 14_900
        }
    }

    public var features: [String] {
        switch self {
        case .voice: return ["Full original recording", "Readable transcript", "Permission record", "Portable downloads"]
        case .story: return ["Everything in Voice", "Source-linked finished chapter", "Complete family archive", "One correction round"]
        case .heirloom: return ["Everything in Story", "Print-ready heirloom PDF", "Layout for up to 12 artifacts", "Two correction rounds total"]
        }
    }

    public var rank: Int { ResultEdition.allCases.firstIndex(of: self) ?? 0 }
}

/// StorySitting is deliberately pay-for-result. Every sitting begins with a $5
/// Story Start; the sponsor chooses a result edition only after seeing a preview.
/// Upgrade products charge the difference, with a one-cent App Store rounding
/// discount where Apple does not offer an exact $110.00 price point. Nothing is
/// a subscription.
public enum StoryPurchase: String, Codable, CaseIterable, Hashable, Sendable {
    case storyStart
    case voiceEdition
    case storyEdition
    case heirloomEdition
    case voiceToStory
    case voiceToHeirloom
    case storyToHeirloom

    public var productID: String {
        switch self {
        case .storyStart: return "com.amflimited.storysitting.story.start"
        case .voiceEdition: return "com.amflimited.storysitting.result.voice"
        case .storyEdition: return "com.amflimited.storysitting.result.story"
        case .heirloomEdition: return "com.amflimited.storysitting.result.heirloom"
        case .voiceToStory: return "com.amflimited.storysitting.upgrade.voice.story"
        case .voiceToHeirloom: return "com.amflimited.storysitting.upgrade.voice.heirloom"
        case .storyToHeirloom: return "com.amflimited.storysitting.upgrade.story.heirloom"
        }
    }

    public var priceCents: Int {
        switch self {
        case .storyStart: return 500
        case .voiceEdition: return 3_900
        case .storyEdition: return 7_900
        case .heirloomEdition: return 14_900
        case .voiceToStory: return 4_000
        case .voiceToHeirloom: return 10_999
        case .storyToHeirloom: return 7_000
        }
    }

    public var displayPrice: String {
        priceCents.isMultiple(of: 100)
            ? "$\(priceCents / 100)"
            : String(format: "$%.2f", Double(priceCents) / 100)
    }

    public var title: String {
        switch self {
        case .storyStart: return "Story Start"
        case .voiceEdition: return "Keep the Voice Edition"
        case .storyEdition: return "Keep the Story Edition"
        case .heirloomEdition: return "Keep the Heirloom Edition"
        case .voiceToStory: return "Add the Story layer"
        case .voiceToHeirloom: return "Add the Heirloom layer"
        case .storyToHeirloom: return "Add the Heirloom layer"
        }
    }

    public var detail: String {
        switch self {
        case .storyStart:
            return "Opens one sitting with a Family Pass. A response requests a separate managed human permission check; neither one grants permission for an AI call."
        case .voiceEdition:
            return "Optional after preview: keep the full original recording, readable transcript, permission record, and portable downloads."
        case .storyEdition, .voiceToStory:
            return "Keep the voice plus a source-linked finished chapter, complete archive, and one factual correction round."
        case .heirloomEdition, .voiceToHeirloom, .storyToHeirloom:
            return "Keep every Story layer plus a print-ready family edition, artifact layout, and two correction rounds total."
        }
    }

    public var targetEdition: ResultEdition? {
        switch self {
        case .storyStart: return nil
        case .voiceEdition: return .voice
        case .storyEdition, .voiceToStory: return .story
        case .heirloomEdition, .voiceToHeirloom, .storyToHeirloom: return .heirloom
        }
    }

    public var sourceEdition: ResultEdition? {
        switch self {
        case .voiceToStory, .voiceToHeirloom: return .voice
        case .storyToHeirloom: return .story
        default: return nil
        }
    }

    public static func purchase(to target: ResultEdition, from current: ResultEdition?) -> StoryPurchase? {
        switch (current, target) {
        case (nil, .voice): return .voiceEdition
        case (nil, .story): return .storyEdition
        case (nil, .heirloom): return .heirloomEdition
        case (.voice, .story): return .voiceToStory
        case (.voice, .heirloom): return .voiceToHeirloom
        case (.story, .heirloom): return .storyToHeirloom
        default: return nil
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
