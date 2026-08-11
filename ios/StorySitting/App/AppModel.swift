import Foundation
import Combine
import StorySittingCore

@MainActor
final class AppModel: ObservableObject {
    enum Tab: Hashable { case shelf, questions, family }

    @Published private(set) var projects: [StoryProject] = []
    @Published private(set) var organizer: FamilyOrganizer?
    @Published var selectedProjectID = "project_evelyn"
    @Published var selectedTab: Tab = .shelf
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?
    @Published var confirmationMessage: String?

    private let api: any StorySittingAPI

    init(api: any StorySittingAPI) {
        self.api = api
    }

    var selectedProject: StoryProject? {
        project(id: selectedProjectID) ?? projects.first
    }

    func project(id: String) -> StoryProject? {
        projects.first(where: { $0.id == id })
    }

    func bootstrap() async {
        guard projects.isEmpty else { return }
        await refresh()
    }

    /// Pulls backend/operator transitions such as the Family Pass response and the
    /// later managed-human permission check. The sponsor cannot create either
    /// transition—or assert storyteller permission—from the app.
    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            organizer = try await api.organizer()
            projects = try await api.shelf()
            if project(id: selectedProjectID) == nil, let first = projects.first {
                selectedProjectID = first.id
            }
        } catch {
            errorMessage = friendly(error)
        }
    }

    func reset() {
        projects = []
        organizer = nil
        selectedProjectID = ""
        selectedTab = .shelf
        errorMessage = nil
        confirmationMessage = nil
    }

    func setSelectedQuestions(projectID: String, ids: Set<String>) async {
        do {
            replace(try await api.updateQuestionSelection(projectID: projectID, selectedIDs: ids))
            confirmationMessage = "Questions saved for the next sitting."
        } catch {
            errorMessage = friendly(error)
        }
    }

    func addQuestion(projectID: String, prompt: String, category: FamilyQuestion.Category) async -> Bool {
        do {
            replace(try await api.addQuestion(projectID: projectID, prompt: prompt, category: category))
            confirmationMessage = "Your question is in the family deck."
            return true
        } catch {
            errorMessage = friendly(error)
            return false
        }
    }

    func createPurchaseIntent(_ request: PurchaseIntentRequest) async -> PurchaseIntent? {
        isLoading = true
        defer { isLoading = false }
        do {
            return try await api.createPurchaseIntent(request)
        } catch {
            errorMessage = friendly(error)
            return nil
        }
    }

    /// Sends StoreKit's signed transaction evidence across the backend boundary.
    /// Idempotent fulfillment makes both immediate and recovered delivery safe.
    func fulfillPurchase(_ payload: VerifiedPurchasePayload) async -> Bool {
        isLoading = true
        defer { isLoading = false }
        do {
            replace(try await api.fulfillPurchase(payload))
            if let purchase = StoryPurchase.allCases.first(where: { $0.productID == payload.productID }),
               let edition = purchase.targetEdition {
                confirmationMessage = "The \(edition.title) is now kept on your Story Shelf."
            }
            return true
        } catch {
            errorMessage = friendly(error)
            return false
        }
    }

    private func replace(_ project: StoryProject) {
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        } else {
            projects.append(project)
        }
    }

    private func friendly(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Something got in the way. Please try again."
    }
}
