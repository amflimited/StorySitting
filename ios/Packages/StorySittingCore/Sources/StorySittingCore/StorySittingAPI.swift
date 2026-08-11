import Foundation

public enum StorySittingAPIError: Error, LocalizedError, Equatable {
    case projectNotFound
    case sittingNotFound
    case chapterNotFound
    case storyStartAcknowledgmentRequired
    case purchaseIntentNotFound
    case purchaseVerificationFailed(String)
    case invalidRequest(String)

    public var errorDescription: String? {
        switch self {
        case .projectNotFound: return "That Story Shelf could not be found."
        case .sittingNotFound: return "That story sitting could not be found."
        case .chapterNotFound: return "That chapter could not be found."
        case .storyStartAcknowledgmentRequired:
            return "Acknowledge that Story Start only creates a Family Pass and that a separate managed human check is required for storyteller permission."
        case .purchaseIntentNotFound:
            return "This purchase could not be matched to its StorySitting intent."
        case .purchaseVerificationFailed(let message): return message
        case .invalidRequest(let message): return message
        }
    }
}

/// Mobile backend boundary. A $5 Story Start creates a Family Pass, but cannot
/// schedule an AI outbound interview. A Family Pass response still cannot schedule
/// one: only a later managed-human identity and permission check may do that. The
/// Result editions remain optional after preview and upgrades charge only the difference.
public protocol StorySittingAPI: Sendable {
    func organizer() async throws -> FamilyOrganizer
    func shelf() async throws -> [StoryProject]
    func project(id: String) async throws -> StoryProject
    func updateQuestionSelection(projectID: String, selectedIDs: Set<String>) async throws -> StoryProject
    func addQuestion(projectID: String, prompt: String, category: FamilyQuestion.Category) async throws -> StoryProject
    func createPurchaseIntent(_ request: PurchaseIntentRequest) async throws -> PurchaseIntent
    /// Idempotently verifies and fulfills the exact server-bound StoreKit transaction.
    func fulfillPurchase(_ payload: VerifiedPurchasePayload) async throws -> StoryProject
}

/// Deliberately absent from the sponsor app's API capability. A trusted operator
/// records the Family Pass response and, as a separate event, the storyteller's
/// verified decision from a managed direct human call. That call may be inbound or
/// agreed outbound; neither transition can be asserted by the family sponsor.
public protocol StorySittingOperatorAPI: Sendable {
    func recordFamilyPassResponse(
        projectID: String,
        callID: String,
        wantsManagedHumanCheck: Bool
    ) async throws -> StoryProject
    func recordManagedHumanPermissionCheck(
        projectID: String,
        callID: String,
        contactDirection: StorytellerPermission.ManagedHumanContactDirection,
        identityVerified: Bool,
        permissionGranted: Bool
    ) async throws -> StoryProject
}

/// Stateful, actor-isolated demo backend used by the app and previews. Its transitions
/// mirror the server contract without shipping private family data off-device.
public actor MockStorySittingAPI: StorySittingAPI, StorySittingOperatorAPI {
    private let familyOrganizer: FamilyOrganizer
    private var projects: [StoryProject]
    private var purchaseIntents: [UUID: PurchaseIntent] = [:]
    private var fulfilledTransactionTokens: [UInt64: UUID] = [:]
    private let now: @Sendable () -> Date
    private let makeToken: @Sendable () -> UUID

    public init(
        referenceDate: Date = Date(timeIntervalSince1970: 1_786_400_000),
        now: @escaping @Sendable () -> Date = { Date() },
        makeToken: @escaping @Sendable () -> UUID = { UUID() }
    ) {
        self.familyOrganizer = FamilyOrganizer(
            id: "organizer_maya",
            name: "Maya Bennett",
            email: "maya@example.com",
            role: .grandchild
        )
        self.projects = StoryFixtures.shelf(referenceDate: referenceDate)
        self.now = now
        self.makeToken = makeToken
    }

    public func organizer() -> FamilyOrganizer { familyOrganizer }
    public func shelf() -> [StoryProject] { projects }

    public func project(id: String) throws -> StoryProject {
        guard let project = projects.first(where: { $0.id == id }) else {
            throw StorySittingAPIError.projectNotFound
        }
        return project
    }

    public func updateQuestionSelection(projectID: String, selectedIDs: Set<String>) throws -> StoryProject {
        let index = try projectIndex(projectID)
        for questionIndex in projects[index].questions.indices {
            projects[index].questions[questionIndex].isSelected = selectedIDs.contains(projects[index].questions[questionIndex].id)
        }
        return projects[index]
    }

    public func addQuestion(
        projectID: String,
        prompt: String,
        category: FamilyQuestion.Category
    ) throws -> StoryProject {
        let clean = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 5 else {
            throw StorySittingAPIError.invalidRequest("Add a little more detail to that question.")
        }
        let index = try projectIndex(projectID)
        let question = FamilyQuestion(
            id: "q_custom_\(projects[index].questions.count + 1)",
            prompt: clean,
            category: category,
            isSelected: true,
            submittedBy: projects[index].organizerName
        )
        projects[index].questions.append(question)
        return projects[index]
    }

    public func createPurchaseIntent(_ request: PurchaseIntentRequest) throws -> PurchaseIntent {
        let index = try projectIndex(request.projectID)
        switch request.purchase {
        case .storyStart:
            guard request.sponsorAcknowledgedHandshake else {
                throw StorySittingAPIError.storyStartAcknowledgmentRequired
            }
            guard request.chapterID == nil else {
                throw StorySittingAPIError.invalidRequest("A Story Start cannot target an existing result.")
            }
        case .voiceEdition, .storyEdition, .heirloomEdition, .voiceToStory, .voiceToHeirloom, .storyToHeirloom:
            guard let chapterID = request.chapterID,
                  let chapter = projects[index].chapters.first(where: { $0.id == chapterID })
            else { throw StorySittingAPIError.chapterNotFound }
            guard let target = request.purchase.targetEdition,
                  target.rank > (chapter.resultEdition?.rank ?? -1),
                  request.purchase.sourceEdition == chapter.resultEdition,
                  projects[index].calls.contains(where: {
                      $0.chapterID == chapterID && ($0.status == .previewReady || $0.status == .delivered)
                  })
            else {
                throw StorySittingAPIError.invalidRequest("This edition is not a valid next layer for the result.")
            }
        }

        let token = makeToken()
        guard purchaseIntents[token] == nil else {
            throw StorySittingAPIError.invalidRequest("Could not create a unique purchase intent.")
        }
        let intent = PurchaseIntent(
            id: "pi_\(token.uuidString.lowercased())",
            appAccountToken: token,
            request: request,
            createdAt: now()
        )
        purchaseIntents[token] = intent
        return intent
    }

    public func fulfillPurchase(_ payload: VerifiedPurchasePayload) throws -> StoryProject {
        // The production backend must cryptographically validate signedTransactionJWS
        // with Apple's server library. This mock validates the intent bindings and
        // idempotency semantics that are portable to Linux tests.
        guard payload.transactionID > 0, !payload.signedTransactionJWS.isEmpty else {
            throw StorySittingAPIError.purchaseVerificationFailed("The App Store transaction proof is incomplete.")
        }
        guard var intent = purchaseIntents[payload.appAccountToken] else {
            throw StorySittingAPIError.purchaseIntentNotFound
        }
        guard payload.productID == intent.purchase.productID else {
            throw StorySittingAPIError.purchaseVerificationFailed("The purchased product does not match its StorySitting intent.")
        }

        if let existingToken = fulfilledTransactionTokens[payload.transactionID] {
            guard existingToken == payload.appAccountToken else {
                throw StorySittingAPIError.purchaseVerificationFailed("This App Store transaction is already bound to another intent.")
            }
            return try project(id: intent.projectID)
        }
        if let fulfilledID = intent.fulfilledTransactionID {
            guard fulfilledID == payload.transactionID else {
                throw StorySittingAPIError.purchaseVerificationFailed("This StorySitting intent was already fulfilled by another transaction.")
            }
            return try project(id: intent.projectID)
        }

        let fulfilledProject: StoryProject
        switch intent.purchase {
        case .storyStart:
            fulfilledProject = try applyStoryStart(intent.request)
        case .voiceEdition, .storyEdition, .heirloomEdition, .voiceToStory, .voiceToHeirloom, .storyToHeirloom:
            guard let chapterID = intent.request.chapterID else {
                throw StorySittingAPIError.chapterNotFound
            }
            guard let edition = intent.purchase.targetEdition else {
                throw StorySittingAPIError.invalidRequest("The result edition is missing.")
            }
            fulfilledProject = try applyResultUnlock(projectID: intent.projectID, chapterID: chapterID, edition: edition)
        }

        intent.status = .fulfilled
        intent.fulfilledTransactionID = payload.transactionID
        purchaseIntents[payload.appAccountToken] = intent
        fulfilledTransactionTokens[payload.transactionID] = payload.appAccountToken
        return fulfilledProject
    }

    public func recordFamilyPassResponse(
        projectID: String,
        callID: String,
        wantsManagedHumanCheck: Bool
    ) throws -> StoryProject {
        let projectIndex = try projectIndex(projectID)
        guard let callIndex = projects[projectIndex].calls.firstIndex(where: { $0.id == callID }) else {
            throw StorySittingAPIError.sittingNotFound
        }
        guard projects[projectIndex].calls[callIndex].status == .awaitingFamilyPassResponse else {
            throw StorySittingAPIError.invalidRequest("This Family Pass has already been answered.")
        }

        let respondedAt = now()
        guard respondedAt >= projects[projectIndex].calls[callIndex].storytellerPermission.familyPassIssuedAt else {
            throw StorySittingAPIError.invalidRequest("The Family Pass response predates the Story Start.")
        }
        projects[projectIndex].calls[callIndex].storytellerPermission.familyPassRespondedAt = respondedAt
        if wantsManagedHumanCheck {
            projects[projectIndex].calls[callIndex].storytellerPermission.status = .awaitingManagedHumanCheck
            projects[projectIndex].calls[callIndex].status = .awaitingManagedHumanPermissionCheck
        } else {
            projects[projectIndex].calls[callIndex].storytellerPermission.status = .declined
            projects[projectIndex].calls[callIndex].status = .permissionDeclined
            projects[projectIndex].calls[callIndex].scheduledFor = nil
        }
        return projects[projectIndex]
    }

    public func recordManagedHumanPermissionCheck(
        projectID: String,
        callID: String,
        contactDirection: StorytellerPermission.ManagedHumanContactDirection,
        identityVerified: Bool,
        permissionGranted: Bool
    ) throws -> StoryProject {
        let projectIndex = try projectIndex(projectID)
        guard let callIndex = projects[projectIndex].calls.firstIndex(where: { $0.id == callID }) else {
            throw StorySittingAPIError.sittingNotFound
        }
        guard projects[projectIndex].calls[callIndex].status == .awaitingManagedHumanPermissionCheck,
              projects[projectIndex].calls[callIndex].storytellerPermission.status == .awaitingManagedHumanCheck,
              let familyPassRespondedAt = projects[projectIndex].calls[callIndex].storytellerPermission.familyPassRespondedAt
        else {
            throw StorySittingAPIError.invalidRequest("A Family Pass response must request the human check first.")
        }
        guard identityVerified else {
            throw StorySittingAPIError.invalidRequest("The human check could not verify the storyteller's identity.")
        }

        let checkedAt = now()
        guard checkedAt >= familyPassRespondedAt else {
            throw StorySittingAPIError.invalidRequest("The managed human check predates the Family Pass response.")
        }
        projects[projectIndex].calls[callIndex].storytellerPermission.managedHumanCheckAt = checkedAt
        projects[projectIndex].calls[callIndex].storytellerPermission.managedHumanContactDirection = contactDirection
        projects[projectIndex].calls[callIndex].storytellerPermission.identityVerifiedAt = checkedAt
        if permissionGranted {
            projects[projectIndex].calls[callIndex].storytellerPermission.status = .granted
            projects[projectIndex].calls[callIndex].storytellerPermission.permissionGrantedAt = checkedAt
            guard projects[projectIndex].calls[callIndex].storytellerPermission.allowsInterviewScheduling else {
                throw StorySittingAPIError.invalidRequest("The managed-human permission record is incomplete.")
            }
            projects[projectIndex].calls[callIndex].status = .scheduled
            projects[projectIndex].calls[callIndex].scheduledFor = checkedAt.addingTimeInterval(86_400)
        } else {
            projects[projectIndex].calls[callIndex].storytellerPermission.status = .declined
            projects[projectIndex].calls[callIndex].status = .permissionDeclined
            projects[projectIndex].calls[callIndex].scheduledFor = nil
        }
        return projects[projectIndex]
    }

    private func applyStoryStart(_ request: PurchaseIntentRequest) throws -> StoryProject {
        guard request.purchase == .storyStart, request.sponsorAcknowledgedHandshake else {
            throw StorySittingAPIError.storyStartAcknowledgmentRequired
        }
        let index = try projectIndex(request.projectID)
        let paidAt = now()
        let nextSequence = (projects[index].calls.map(\.sequence).max() ?? 0) + 1
        let call = StoryCall(
            id: "call_\(request.projectID)_\(nextSequence)",
            sequence: nextSequence,
            status: .awaitingFamilyPassResponse,
            storyStartPurchaseDate: paidAt,
            storytellerPermission: StorytellerPermission(
                status: .awaitingFamilyPassResponse,
                familyPassIssuedAt: paidAt
            ),
            selectedQuestionIDs: request.selectedQuestionIDs
        )
        projects[index].calls.append(call)
        return projects[index]
    }

    private func applyResultUnlock(projectID: String, chapterID: String, edition: ResultEdition) throws -> StoryProject {
        let index = try projectIndex(projectID)
        guard let chapterIndex = projects[index].chapters.firstIndex(where: { $0.id == chapterID }) else {
            throw StorySittingAPIError.chapterNotFound
        }
        if edition.rank >= ResultEdition.story.rank,
           projects[index].chapters[chapterIndex].fullText == nil {
            projects[index].chapters[chapterIndex].fullText = StoryFixtures.completedText(for: chapterID)
        }
        projects[index].chapters[chapterIndex].access = .unlocked
        projects[index].chapters[chapterIndex].resultEdition = edition
        if let callIndex = projects[index].calls.firstIndex(where: { $0.chapterID == chapterID }) {
            projects[index].calls[callIndex].status = .delivered
            projects[index].calls[callIndex].chapterPurchaseDate = now()
        }
        return projects[index]
    }

    private func projectIndex(_ id: String) throws -> Int {
        guard let index = projects.firstIndex(where: { $0.id == id }) else {
            throw StorySittingAPIError.projectNotFound
        }
        return index
    }
}
