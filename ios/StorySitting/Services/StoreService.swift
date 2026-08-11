import Foundation
import Combine
import StoreKit
import StorySittingCore

/// StoreKit 2 wrapper for repeatable consumables. Each transaction is bound to a
/// backend PurchaseIntent via appAccountToken, retained by transaction ID, sent to
/// the API as signed JWS evidence, and finished only after exact fulfillment.
@MainActor
final class StoreService: ObservableObject {
    @Published private(set) var products: [StoryPurchase: Product] = [:]
    @Published private(set) var purchasing: StoryPurchase?
    @Published private(set) var unfulfilledProofs: [VerifiedPurchasePayload] = []
    @Published var lastError: String?

    private var updateListener: Task<Void, Never>?
    private var verifiedTransactions: [UInt64: Transaction] = [:]

    init() {
        updateListener = listenForTransactions()
        Task { await refresh() }
    }

    deinit { updateListener?.cancel() }

    var unfulfilledTransactionIDs: [UInt64] {
        unfulfilledProofs.map(\.transactionID).sorted()
    }

    func displayPrice(for purchase: StoryPurchase) -> String {
        products[purchase]?.displayPrice ?? purchase.displayPrice
    }

    func refresh() async {
        do {
            let loaded = try await Product.products(for: StoryPurchase.allCases.map(\.productID))
            products = Dictionary(uniqueKeysWithValues: loaded.compactMap { product in
                StoryPurchase.allCases.first(where: { $0.productID == product.id }).map { ($0, product) }
            })
        } catch {
            lastError = "The App Store is unavailable right now."
        }
    }

    func purchase(_ kind: StoryPurchase, intent: PurchaseIntent) async -> VerifiedPurchasePayload? {
        guard intent.purchase == kind else {
            lastError = "The purchase does not match its StorySitting intent."
            return nil
        }
        if products[kind] == nil { await refresh() }
        guard let product = products[kind] else {
            lastError = "This purchase is unavailable right now. Please try again shortly."
            return nil
        }

        purchasing = kind
        defer { purchasing = nil }
        do {
            switch try await product.purchase(options: [.appAccountToken(intent.appAccountToken)]) {
            case .success(let verification):
                guard let proof = stage(verification, enqueueForRecovery: true) else {
                    lastError = "The purchase could not be verified. It remains unfinished for recovery."
                    return nil
                }
                return proof
            case .pending:
                lastError = "The purchase is waiting for approval. It will be fulfilled after approval."
                return nil
            case .userCancelled:
                return nil
            @unknown default:
                return nil
            }
        } catch {
            lastError = "The purchase did not go through. You were not charged."
            return nil
        }
    }

    /// Replays every verified, unfinished transaction. The app sends these proofs to
    /// the idempotent backend fulfillment endpoint before calling `finish`.
    func recoverUnfinished() async {
        for await verification in Transaction.unfinished {
            _ = stage(verification, enqueueForRecovery: true)
        }
    }

    /// Finishes exactly the transaction the backend confirmed—not another purchase
    /// of the same consumable product.
    func finish(transactionID: UInt64) async {
        guard let transaction = verifiedTransactions[transactionID] else { return }
        await transaction.finish()
        verifiedTransactions.removeValue(forKey: transactionID)
        unfulfilledProofs.removeAll { $0.transactionID == transactionID }
    }

    private func stage(
        _ verification: VerificationResult<Transaction>,
        enqueueForRecovery: Bool
    ) -> VerifiedPurchasePayload? {
        guard case .verified(let transaction) = verification,
              StoryPurchase.allCases.contains(where: { $0.productID == transaction.productID })
        else { return nil }
        guard let appAccountToken = transaction.appAccountToken else {
            lastError = "An unfinished purchase is missing its StorySitting account token and was not consumed."
            return nil
        }

        let proof = VerifiedPurchasePayload(
            transactionID: transaction.id,
            originalTransactionID: transaction.originalID,
            productID: transaction.productID,
            appAccountToken: appAccountToken,
            signedTransactionJWS: verification.jwsRepresentation
        )
        verifiedTransactions[transaction.id] = transaction
        if enqueueForRecovery,
           !unfulfilledProofs.contains(where: { $0.transactionID == transaction.id }) {
            unfulfilledProofs.append(proof)
        }
        return proof
    }

    private func listenForTransactions() -> Task<Void, Never> {
        Task { @MainActor [weak self] in
            for await verification in Transaction.updates {
                guard let self else { return }
                _ = self.stage(verification, enqueueForRecovery: true)
            }
        }
    }
}
