import Foundation
import SwiftUI
import StorySittingCore

struct FamilyView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var account: AccountSession

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 9) {
                        Eyebrow(text: "Sponsor account")
                        Text("The family side of the record.")
                            .font(StoryTheme.FontBook.display(40, weight: .medium))
                            .tracking(-1.2)
                            .foregroundStyle(StoryTheme.ink)
                        Text("\(model.organizer?.name.components(separatedBy: " ").first ?? "You"), you sponsor the story. Your loved ones need no account or app, but their verified permission always comes first.")
                            .font(StoryTheme.FontBook.body(14))
                            .foregroundStyle(StoryTheme.mutedInk)
                    }

                    organizerCard

                    SectionHeading(eyebrow: "Your storytellers", title: "Family circle")
                    ForEach(model.projects) { project in
                        Button {
                            model.selectedProjectID = project.id
                            model.selectedTab = .shelf
                        } label: {
                            HStack(spacing: 13) {
                                FamilyPortrait(name: project.storyteller.name, size: 52, seed: project.accentSeed)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(project.storyteller.familiarName)
                                        .font(StoryTheme.FontBook.display(19))
                                        .foregroundStyle(StoryTheme.ink)
                                    Text("\(project.chapters.count) chapter\(project.chapters.count == 1 ? "" : "s") · phone ending \(project.storyteller.phoneLastFour)")
                                        .font(StoryTheme.FontBook.body(10, weight: .semibold))
                                        .foregroundStyle(StoryTheme.mutedInk)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(StoryTheme.recorderTeal)
                            }
                            .paperCard(padding: 14, tone: StoryTheme.paperBright.opacity(0.82))
                        }
                        .buttonStyle(.plain)
                    }

                    economicsCard
                    consentCenter
                    privacyCard

                    Button {
                        Task {
                            await account.signOut()
                            model.reset()
                        }
                    } label: {
                        HStack {
                            Text("Sign out of StorySitting")
                            Spacer()
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                        }
                        .font(StoryTheme.FontBook.label(12))
                        .foregroundStyle(StoryTheme.recorderTeal)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .disabled(account.isWorking)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .padding(.bottom, 34)
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(StoryTheme.endpaper.opacity(0.94), for: .navigationBar)
    }

    private var organizerCard: some View {
        HStack(spacing: 14) {
            ZStack {
                Rectangle().fill(StoryTheme.recorderTeal)
                Text(model.organizer?.name.first.map { String($0) } ?? "M")
                    .font(StoryTheme.FontBook.display(25))
                    .foregroundStyle(StoryTheme.paperBright)
            }
            .frame(width: 60, height: 60)
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(text: "Family organizer")
                Text(model.organizer?.name ?? "Family organizer")
                    .font(StoryTheme.FontBook.display(21))
                    .foregroundStyle(StoryTheme.ink)
                Text("\(model.organizer?.role.label ?? "Family organizer") · purchases stay with this account")
                    .font(StoryTheme.FontBook.body(10, weight: .semibold))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard(tone: StoryTheme.paperBright)
    }

    private var economicsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(eyebrow: "Pay for the result", title: "Start, preview, then decide")
                .padding(.bottom, 10)
            economicsRow("TODAY", "$5", "Open one Story Start and Family Pass")
            economicsRow("IF THEY DECLINE", "$0", "Nothing else is charged and no interview is scheduled")
            economicsRow("AFTER AUTHORIZATION", "$0", "Receive a representative private result preview")
            economicsRow("YOUR CHOICE", "$39+", "Voice, Story, or Heirloom; upgrades charge only the difference")
            economicsRow("RECURRING", "$0", "No subscription; every next sitting requires another deliberate $5", isLast: true)
        }
        .paperCard(tone: StoryTheme.paperBright.opacity(0.84))
    }

    private func economicsRow(_ moment: String, _ price: String, _ detail: String, isLast: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(moment)
                .font(StoryTheme.FontBook.folio(8))
                .foregroundStyle(StoryTheme.mutedInk)
                .frame(width: 84, alignment: .leading)
            Text(price)
                .font(StoryTheme.FontBook.display(19))
                .foregroundStyle(StoryTheme.recorderTeal)
                .frame(width: 46, alignment: .leading)
            Text(detail)
                .font(StoryTheme.FontBook.body(10, weight: .medium))
                .foregroundStyle(StoryTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 11)
        .overlay(alignment: .bottom) {
            if !isLast { Divider().overlay(StoryTheme.hairline) }
        }
    }

    private var consentCenter: some View {
        VStack(alignment: .leading, spacing: 15) {
            SectionHeading(eyebrow: "Safe handshake", title: "A response is not permission")
            consentGate(
                "01",
                "Family Pass response",
                "Your loved one responds for themselves. A yes here only requests the next step; it does not schedule an AI interview."
            )
            consentGate(
                "02",
                "Managed human permission check",
                "A human speaks directly with them—on a call they make or agree to receive—verifies identity, explains the AI interview, and records their decision."
            )
            consentGate(
                "03",
                "AI + recording reconfirmed",
                "If they granted permission to schedule, the interview still begins with a fresh disclosure and a new yes before recording."
            )
            Text("“\(InterviewConsentRecord.requiredDisclosure)”")
                .font(StoryTheme.FontBook.editorial(16))
                .foregroundStyle(StoryTheme.ink)
                .lineSpacing(4)
            Divider().overlay(StoryTheme.hairline)
            consentRule("No surprise AI outreach", "An AI interview cannot be scheduled before the managed human identity and permission check is complete.")
            consentRule("Choice stays theirs", "They can decline on the Family Pass, during the human check, or at the interview—and can stop at any moment.")
        }
        .paperCard(tone: StoryTheme.amberWash.opacity(0.22))
    }

    private func consentRule(_ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.shield.fill")
                .foregroundStyle(StoryTheme.recorderTeal)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(StoryTheme.FontBook.label(12))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(10))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private func consentGate(_ number: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(number)
                .font(StoryTheme.FontBook.folio(10))
                .foregroundStyle(StoryTheme.paperBright)
                .frame(width: 31, height: 31)
                .background(StoryTheme.recorderTeal, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(10))
                    .foregroundStyle(StoryTheme.mutedInk)
            }
        }
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "lock.shield.fill")
                    .foregroundStyle(StoryTheme.recorderTeal)
                Text("Private by default")
                    .font(StoryTheme.FontBook.display(20))
                    .foregroundStyle(StoryTheme.ink)
            }
            Text("Family recordings and chapters belong in the family—not in a public feed, an ad profile, or a training set.")
                .font(StoryTheme.FontBook.body(12))
                .foregroundStyle(StoryTheme.mutedInk)
        }
        .paperCard(tone: StoryTheme.sage.opacity(0.18))
    }
}
