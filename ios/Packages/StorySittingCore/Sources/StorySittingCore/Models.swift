import Foundation

/// The paying app account. The storyteller is intentionally a separate model and
/// never needs credentials, a device, or an app installation.
public struct FamilyOrganizer: Codable, Equatable, Identifiable, Sendable {
    public enum Role: String, Codable, CaseIterable, Sendable {
        case adultChild, grandchild, otherFamily

        public var label: String {
            switch self {
            case .adultChild: return "Adult child"
            case .grandchild: return "Grandchild"
            case .otherFamily: return "Family organizer"
            }
        }
    }

    public let id: String
    public var name: String
    public var email: String
    public var role: Role

    public init(id: String, name: String, email: String, role: Role) {
        self.id = id
        self.name = name
        self.email = email
        self.role = role
    }
}

public struct Storyteller: Codable, Equatable, Identifiable, Sendable {
    public enum Relationship: String, Codable, CaseIterable, Sendable {
        case grandmother, grandfather, mother, father, aunt, uncle, familyFriend, other

        public var label: String {
            switch self {
            case .grandmother: return "Grandmother"
            case .grandfather: return "Grandfather"
            case .mother: return "Mother"
            case .father: return "Father"
            case .aunt: return "Aunt"
            case .uncle: return "Uncle"
            case .familyFriend: return "Family friend"
            case .other: return "Loved one"
            }
        }
    }

    public let id: String
    public var name: String
    public var familiarName: String
    public var relationship: Relationship
    public var phoneLastFour: String
    public var birthYear: Int?

    public init(
        id: String,
        name: String,
        familiarName: String,
        relationship: Relationship,
        phoneLastFour: String,
        birthYear: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.familiarName = familiarName
        self.relationship = relationship
        self.phoneLastFour = phoneLastFour
        self.birthYear = birthYear
    }
}

public struct FamilyQuestion: Codable, Equatable, Identifiable, Sendable {
    public enum Category: String, Codable, CaseIterable, Sendable {
        case beginnings, home, traditions, turningPoints, people, wisdom

        public var title: String {
            switch self {
            case .beginnings: return "Where it began"
            case .home: return "Home & place"
            case .traditions: return "Traditions"
            case .turningPoints: return "Turning points"
            case .people: return "People they love"
            case .wisdom: return "What they know"
            }
        }
    }

    public let id: String
    public var prompt: String
    public var category: Category
    public var isSelected: Bool
    public var answeredInChapterID: String?
    public var submittedBy: String?

    public init(
        id: String,
        prompt: String,
        category: Category,
        isSelected: Bool = false,
        answeredInChapterID: String? = nil,
        submittedBy: String? = nil
    ) {
        self.id = id
        self.prompt = prompt
        self.category = category
        self.isSelected = isSelected
        self.answeredInChapterID = answeredInChapterID
        self.submittedBy = submittedBy
    }
}

public struct AudioKeepsake: Codable, Equatable, Sendable {
    public var durationSeconds: Int
    public var previewSeconds: Int
    public var audioURL: URL?

    public init(durationSeconds: Int, previewSeconds: Int = 45, audioURL: URL? = nil) {
        self.durationSeconds = durationSeconds
        self.previewSeconds = previewSeconds
        self.audioURL = audioURL
    }

    public var durationLabel: String {
        Self.clock(durationSeconds)
    }

    public var previewLabel: String {
        Self.clock(min(previewSeconds, durationSeconds))
    }

    private static func clock(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }
}

public struct StoryChapter: Codable, Equatable, Identifiable, Sendable {
    public enum Access: String, Codable, Sendable { case preview, unlocked }

    public let id: String
    public var number: Int
    public var title: String
    public var dek: String
    public var previewText: String
    /// Nil in preview payloads. The backend returns the completed text only after
    /// the optional result purchase is verified and fulfilled.
    public var fullText: String?
    public var pullQuote: String
    public var recordedAt: Date
    public var access: Access
    public var audio: AudioKeepsake

    public init(
        id: String,
        number: Int,
        title: String,
        dek: String,
        previewText: String,
        fullText: String?,
        pullQuote: String,
        recordedAt: Date,
        access: Access,
        audio: AudioKeepsake
    ) {
        self.id = id
        self.number = number
        self.title = title
        self.dek = dek
        self.previewText = previewText
        self.fullText = fullText
        self.pullQuote = pullQuote
        self.recordedAt = recordedAt
        self.access = access
        self.audio = audio
    }

    public var isUnlocked: Bool { access == .unlocked }
    public var readableText: String { isUnlocked ? (fullText ?? previewText) : previewText }
}

/// The safe handshake happens before any automated or AI outbound interview can be
/// scheduled. A Family Pass response is only a request for the next step: a managed,
/// direct human conversation must separately verify the storyteller's identity and
/// record their permission. A sponsor cannot grant that permission.
public struct StorytellerPermission: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable {
        case awaitingFamilyPassResponse
        case awaitingManagedHumanCheck
        case granted
        case declined
    }

    public enum ManagedHumanContactDirection: String, Codable, Sendable {
        case inbound
        case outbound
    }

    public static let managedHumanCheckExplanation = "Respond to the Family Pass first. StorySitting will then arrange a direct conversation with a human—on a call you make or one you agree to receive. That human verifies who you are, explains the optional AI-assisted interview, and asks for your permission to schedule it. Your family sponsor cannot answer for you."

    public var status: Status
    public var familyPassIssuedAt: Date
    public var familyPassRespondedAt: Date?
    public var managedHumanCheckAt: Date?
    public var managedHumanContactDirection: ManagedHumanContactDirection?
    public var identityVerifiedAt: Date?
    public var permissionGrantedAt: Date?

    public init(
        status: Status,
        familyPassIssuedAt: Date,
        familyPassRespondedAt: Date? = nil,
        managedHumanCheckAt: Date? = nil,
        managedHumanContactDirection: ManagedHumanContactDirection? = nil,
        identityVerifiedAt: Date? = nil,
        permissionGrantedAt: Date? = nil
    ) {
        self.status = status
        self.familyPassIssuedAt = familyPassIssuedAt
        self.familyPassRespondedAt = familyPassRespondedAt
        self.managedHumanCheckAt = managedHumanCheckAt
        self.managedHumanContactDirection = managedHumanContactDirection
        self.identityVerifiedAt = identityVerifiedAt
        self.permissionGrantedAt = permissionGrantedAt
    }

    /// The sole domain precondition for creating an AI interview schedule.
    public var allowsInterviewScheduling: Bool {
        guard status == .granted,
              let familyPassRespondedAt,
              let managedHumanCheckAt,
              managedHumanContactDirection != nil,
              let identityVerifiedAt,
              let permissionGrantedAt
        else { return false }
        return familyPassRespondedAt >= familyPassIssuedAt
            && managedHumanCheckAt >= familyPassRespondedAt
            && identityVerifiedAt >= managedHumanCheckAt
            && permissionGrantedAt >= identityVerifiedAt
    }
}

/// A separate, on-interview reconfirmation. Even after the safe handshake, the AI
/// interviewer must disclose itself and request recording consent again.
public struct InterviewConsentRecord: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case notRequested, granted, declined }

    /// The disclosure is fixed in the domain model so a client cannot silently omit it.
    public static let requiredDisclosure = "This is StorySitting. You previously gave us permission to arrange this interview. Before we begin: I’m an AI-assisted interviewer, and this interview will be recorded to create a private family story. Is it okay to continue?"

    public var status: Status
    public var respondedAt: Date?
    public var disclosure: String

    public init(
        status: Status = .notRequested,
        respondedAt: Date? = nil,
        disclosure: String = InterviewConsentRecord.requiredDisclosure
    ) {
        self.status = status
        self.respondedAt = respondedAt
        self.disclosure = disclosure
    }

    public var allowsRecording: Bool {
        status == .granted && respondedAt != nil
    }
}

public struct CallMilestone: Codable, Equatable, Identifiable, Sendable {
    public enum State: String, Codable, Sendable { case complete, current, upcoming, stopped }

    public let id: String
    public var title: String
    public var detail: String
    public var state: State
    public var date: Date?

    public init(id: String, title: String, detail: String, state: State, date: Date? = nil) {
        self.id = id
        self.title = title
        self.detail = detail
        self.state = state
        self.date = date
    }
}

public struct StoryCall: Codable, Equatable, Identifiable, Sendable {
    public enum Status: String, Codable, Sendable {
        case awaitingFamilyPassResponse
        case awaitingManagedHumanPermissionCheck
        case scheduled
        case awaitingInterviewConsent
        case interviewing
        case craftingPreview
        case previewReady
        case delivered
        case permissionDeclined
        case interviewConsentDeclined
        case cancelled
    }

    public let id: String
    public var sequence: Int
    public var status: Status
    public var storyStartPurchaseDate: Date
    public var storytellerPermission: StorytellerPermission
    public var scheduledFor: Date?
    public var interviewConsent: InterviewConsentRecord
    public var interviewStartedAt: Date?
    public var interviewEndedAt: Date?
    public var selectedQuestionIDs: [String]
    public var chapterID: String?
    public var chapterPurchaseDate: Date?

    public init(
        id: String,
        sequence: Int,
        status: Status,
        storyStartPurchaseDate: Date,
        storytellerPermission: StorytellerPermission,
        scheduledFor: Date? = nil,
        interviewConsent: InterviewConsentRecord = InterviewConsentRecord(),
        interviewStartedAt: Date? = nil,
        interviewEndedAt: Date? = nil,
        selectedQuestionIDs: [String] = [],
        chapterID: String? = nil,
        chapterPurchaseDate: Date? = nil
    ) {
        self.id = id
        self.sequence = sequence
        self.status = status
        self.storyStartPurchaseDate = storyStartPurchaseDate
        self.storytellerPermission = storytellerPermission
        self.scheduledFor = scheduledFor
        self.interviewConsent = interviewConsent
        self.interviewStartedAt = interviewStartedAt
        self.interviewEndedAt = interviewEndedAt
        self.selectedQuestionIDs = selectedQuestionIDs
        self.chapterID = chapterID
        self.chapterPurchaseDate = chapterPurchaseDate
    }

    public var isActive: Bool {
        ![.delivered, .permissionDeclined, .interviewConsentDeclined, .cancelled].contains(status)
    }

    /// False indicates corrupt or unsafe server state: a schedule exists without
    /// a completed managed-human identity and permission check.
    public var hasSafeSchedule: Bool {
        guard let scheduledFor else { return true }
        guard storytellerPermission.allowsInterviewScheduling,
              let permissionGrantedAt = storytellerPermission.permissionGrantedAt
        else { return false }
        return permissionGrantedAt <= scheduledFor
    }

    /// Recording/interview timestamps are valid only after the second, on-interview yes.
    public var hasSafeRecordingState: Bool {
        guard let interviewStartedAt else { return true }
        guard interviewConsent.allowsRecording, let respondedAt = interviewConsent.respondedAt else { return false }
        return respondedAt <= interviewStartedAt
    }

    public var timeline: [CallMilestone] {
        let permissionStopped = status == .permissionDeclined || status == .cancelled
        let interviewStopped = status == .interviewConsentDeclined || permissionStopped
        let familyPassResponseComplete = storytellerPermission.familyPassRespondedAt != nil
        let permissionComplete = storytellerPermission.allowsInterviewScheduling
        let consentComplete = interviewConsent.allowsRecording
        let conversationComplete = interviewEndedAt != nil
        let previewComplete = [.previewReady, .delivered].contains(status)
        let deliveryComplete = status == .delivered
        let scheduledComplete = permissionComplete && scheduledFor != nil && status != .scheduled

        return [
            CallMilestone(
                id: "story-start",
                title: "Story Start",
                detail: "$5 deliberately starts this sitting",
                state: .complete,
                date: storyStartPurchaseDate
            ),
            CallMilestone(
                id: "family-pass",
                title: "Family Pass ready",
                detail: "An invitation for the storyteller to respond for themselves",
                state: .complete,
                date: storytellerPermission.familyPassIssuedAt
            ),
            CallMilestone(
                id: "family-pass-response",
                title: storytellerPermission.status == .declined && storytellerPermission.managedHumanCheckAt == nil
                    ? "Family Pass declined"
                    : "Family Pass response",
                detail: storytellerPermission.status == .declined && storytellerPermission.managedHumanCheckAt == nil
                    ? "The storyteller declined; no human check or AI interview was scheduled"
                    : "Their response requests a separate direct human permission check",
                state: status == .cancelled
                    ? .stopped
                    : (storytellerPermission.status == .declined && storytellerPermission.managedHumanCheckAt == nil
                    ? .stopped
                    : (familyPassResponseComplete ? .complete : .current)),
                date: storytellerPermission.familyPassRespondedAt
            ),
            CallMilestone(
                id: "managed-human-permission",
                title: storytellerPermission.status == .declined && storytellerPermission.managedHumanCheckAt != nil
                    ? "Permission declined"
                    : "Human identity & permission check",
                detail: storytellerPermission.status == .declined && storytellerPermission.managedHumanCheckAt != nil
                    ? "The verified storyteller said no; no AI interview was scheduled"
                    : "A managed human call may be inbound or agreed outbound",
                state: status == .cancelled || storytellerPermission.status == .declined
                    ? .stopped
                    : (permissionComplete ? .complete : (familyPassResponseComplete ? .current : .upcoming)),
                date: storytellerPermission.managedHumanCheckAt
            ),
            CallMilestone(
                id: "scheduled",
                title: "AI interview scheduled",
                detail: "Only available after verified storyteller permission",
                state: permissionStopped
                    ? .stopped
                    : (!permissionComplete ? .upcoming : (status == .scheduled ? .current : (scheduledComplete ? .complete : .upcoming))),
                date: scheduledFor
            ),
            CallMilestone(
                id: "interview-consent",
                title: interviewConsent.status == .declined ? "Interview consent declined" : "AI & recording reconfirmed",
                detail: interviewConsent.status == .declined
                    ? "The interview ended; nothing was recorded"
                    : "AI identity and recording are disclosed again before the sitting",
                state: permissionStopped
                    ? .stopped
                    : (interviewConsent.status == .declined
                    ? .stopped
                    : (consentComplete ? .complete : (status == .awaitingInterviewConsent ? .current : .upcoming))),
                date: interviewConsent.respondedAt
            ),
            CallMilestone(
                id: "conversation",
                title: "Story sitting",
                detail: interviewStopped ? "Not recorded" : "A gentle, guided story conversation",
                state: interviewStopped ? .stopped : (conversationComplete ? .complete : (status == .interviewing ? .current : .upcoming)),
                date: interviewEndedAt
            ),
            CallMilestone(
                id: "preview",
                title: "Result preview prepared",
                detail: "Listen and read before deciding whether to keep it",
                state: interviewStopped ? .stopped : (previewComplete ? .complete : (status == .craftingPreview ? .current : .upcoming))
            ),
            CallMilestone(
                id: "delivery",
                title: "Keep the result",
                detail: deliveryComplete ? "$79 paid — unlocked on the Story Shelf" : "Optional $79 only after the preview is ready",
                state: interviewStopped ? .stopped : (deliveryComplete ? .complete : (status == .previewReady ? .current : .upcoming)),
                date: chapterPurchaseDate
            )
        ]
    }
}

public struct StoryProject: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public var title: String
    public var organizerName: String
    public var storyteller: Storyteller
    public var chapters: [StoryChapter]
    public var calls: [StoryCall]
    public var questions: [FamilyQuestion]
    public var accentSeed: Int

    public init(
        id: String,
        title: String,
        organizerName: String,
        storyteller: Storyteller,
        chapters: [StoryChapter] = [],
        calls: [StoryCall] = [],
        questions: [FamilyQuestion] = [],
        accentSeed: Int = 0
    ) {
        self.id = id
        self.title = title
        self.organizerName = organizerName
        self.storyteller = storyteller
        self.chapters = chapters
        self.calls = calls
        self.questions = questions
        self.accentSeed = accentSeed
    }

    public var latestCall: StoryCall? {
        calls.sorted { $0.sequence > $1.sequence }.first
    }

    public var selectedQuestionCount: Int {
        questions.filter(\.isSelected).count
    }

    public var completedChapterCount: Int {
        chapters.filter(\.isUnlocked).count
    }
}
