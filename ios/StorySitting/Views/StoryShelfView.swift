import SwiftUI
import StorySittingCore

struct StoryShelfView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            EndpaperField()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    masthead
                    introduction

                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(
                            eyebrow: "Sponsor workspace",
                            title: "Family projects",
                            trailing: "\(model.projects.count) OPEN"
                        )

                        ForEach(model.projects) { project in
                            NavigationLink {
                                StoryDetailView(projectID: project.id)
                            } label: {
                                ProjectLedgerRow(project: project)
                            }
                            .buttonStyle(.plain)
                            .simultaneousGesture(TapGesture().onEnded {
                                model.selectedProjectID = project.id
                            })
                        }
                    }

                    processIndex
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 38)
            }
            .refreshable { await model.refresh() }
        }
        .navigationBarHidden(true)
    }

    private var masthead: some View {
        HStack(alignment: .top) {
            StoryMark()
            Spacer()
            Button {
                model.selectedTab = .family
            } label: {
                VStack(alignment: .trailing, spacing: 3) {
                    Text(model.organizer?.name.components(separatedBy: " ").first ?? "Account")
                        .font(StoryTheme.FontBook.label(12))
                    Text("FAMILY SPONSOR")
                        .font(StoryTheme.FontBook.folio(7))
                        .tracking(0.8)
                }
                .foregroundStyle(StoryTheme.recorderTeal)
                .padding(.vertical, 7)
                .padding(.leading, 12)
                .overlay(alignment: .leading) {
                    Rectangle().fill(StoryTheme.hairline).frame(width: 1)
                }
            }
            .accessibilityLabel("Open family account")
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "The Story Shelf")
            Text("What needs you now.")
                .font(StoryTheme.FontBook.display(43, weight: .medium))
                .tracking(-1.3)
                .foregroundStyle(StoryTheme.ink)
            Text("Each project names its current step and the next action. Nothing advances—and nothing else is charged—without the right person's choice.")
                .font(StoryTheme.FontBook.body(15))
                .foregroundStyle(StoryTheme.mutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var processIndex: some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeading(eyebrow: "Plain economics", title: "One sitting, beginning to end")
                .padding(.bottom, 12)
            processRow("01", "$5 Story Start", "Opens one sitting and a Family Pass.")
            processRow("02", "Their response + human check", "The storyteller decides; a human separately verifies identity and permission.")
            processRow("03", "Authorized phone sitting", "AI and recording are disclosed again before a fresh yes.")
            processRow("04", "Private preview", "Listen and read a representative result before paying more.")
            processRow("05", "Choose an edition", "$39 Voice, $79 Story, or $149 Heirloom; each is optional.")
            processRow("06", "Correct or start another", "Another sitting happens only after another deliberate $5 start.", isLast: true)
        }
        .padding(.top, 4)
    }

    private func processRow(_ number: String, _ title: String, _ detail: String, isLast: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 13) {
            Text(number)
                .font(StoryTheme.FontBook.folio(9))
                .foregroundStyle(StoryTheme.emulsionAmber)
                .frame(width: 25, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(StoryTheme.FontBook.label(13))
                    .foregroundStyle(StoryTheme.ink)
                Text(detail)
                    .font(StoryTheme.FontBook.body(11))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            if !isLast { Divider().overlay(StoryTheme.hairline) }
        }
    }
}

private struct ProjectLedgerRow: View {
    let project: StoryProject

    var body: some View {
        let step = project.sponsorStep
        VStack(alignment: .leading, spacing: 15) {
            HStack(alignment: .top, spacing: 13) {
                FamilyPortrait(name: project.storyteller.name, size: 54, seed: project.accentSeed)
                VStack(alignment: .leading, spacing: 3) {
                    Text(project.storyteller.familiarName)
                        .font(StoryTheme.FontBook.display(22))
                        .foregroundStyle(StoryTheme.ink)
                    Text(project.storyteller.relationship.label + " · phone ending " + project.storyteller.phoneLastFour)
                        .font(StoryTheme.FontBook.body(10, weight: .medium))
                        .foregroundStyle(StoryTheme.mutedInk)
                }
                Spacer()
                Text("\(project.completedChapterCount) KEPT")
                    .font(StoryTheme.FontBook.folio(8))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .padding(.top, 4)
            }

            Divider().overlay(StoryTheme.hairline)

            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(text: step.position, color: step.color)
                Text(step.title)
                    .font(StoryTheme.FontBook.display(24))
                    .foregroundStyle(StoryTheme.ink)
                Text(step.detail)
                    .font(StoryTheme.FontBook.body(12))
                    .foregroundStyle(StoryTheme.mutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Text(step.actionTitle)
                    .font(StoryTheme.FontBook.label(12))
                    .foregroundStyle(StoryTheme.recorderTeal)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(StoryTheme.recorderTeal)
            }
            .padding(.top, 2)
        }
        .paperCard(padding: 17, tone: StoryTheme.paperBright.opacity(0.88))
        .overlay(alignment: .leading) {
            Rectangle().fill(step.color).frame(width: 3)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(project.storyteller.familiarName). \(step.title). \(step.detail)")
        .accessibilityHint(step.actionTitle)
    }
}
