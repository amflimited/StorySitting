export type WorkflowRole = "owner" | "contributor" | "staff";

export type CapsuleWorkflowStep = {
  key: string;
  label: string;
  plainLabel: string;
  purpose: string;
  ownerAction: string;
  contributorAction: string;
  staffAction: string;
  doneWhen: string;
};

export const capsuleWorkflow: CapsuleWorkflowStep[] = [
  {
    key: "open_room",
    label: "1. Open the Story Room",
    plainLabel: "Open room",
    purpose: "Create one private place for the family story project.",
    ownerAction: "Create the Story Room and explain what story or place the family is trying to preserve.",
    contributorAction: "Wait for an invite from the family organizer.",
    staffAction: "Confirm the room has a clear subject and why-now reason.",
    doneWhen: "The Story Room exists and has a subject, package path, and privacy status."
  },
  {
    key: "gather_material",
    label: "2. Gather family material",
    plainLabel: "Gather material",
    purpose: "Collect memories, questions, photos, recipes, documents, objects, and voice notes before the interview.",
    ownerAction: "Invite relatives and ask each person to submit one useful memory, question, photo, or voice note.",
    contributorAction: "Submit one memory, question, recipe, photo, document, or voice note. Small details are useful.",
    staffAction: "Watch for incoming contributions and identify what is still missing.",
    doneWhen: "The room has multiple contributions, at least one question, and at least one physical or voice anchor."
  },
  {
    key: "review_material",
    label: "3. Review and organize",
    plainLabel: "Review",
    purpose: "Turn raw family submissions into usable story material.",
    ownerAction: "Check whether more relatives need to be invited or whether any missing context should be added.",
    contributorAction: "Submit another item if one memory unlocked another.",
    staffAction: "Approve, archive, or request follow-up on each contribution.",
    doneWhen: "Useful contributions have been approved and weak or duplicate items are archived."
  },
  {
    key: "make_memory_cards",
    label: "4. Create Memory Cards",
    plainLabel: "Memory Cards",
    purpose: "Convert approved contributions into story blocks with summaries, quotes, people, places, dates, themes, and follow-up needs.",
    ownerAction: "Review the direction if staff asks for clarification.",
    contributorAction: "Answer follow-up questions if needed.",
    staffAction: "Create Memory Cards from the strongest contributions and select the ones that belong in the Story Map.",
    doneWhen: "The room has selected Memory Cards that represent the strongest story material."
  },
  {
    key: "build_story_map",
    label: "5. Build the Story Map",
    plainLabel: "Story Map",
    purpose: "Create the interview and production plan before the guided session.",
    ownerAction: "Confirm the Story Map direction and help fill any missing names, dates, or places.",
    contributorAction: "Answer any final pre-session questions.",
    staffAction: "Turn selected Memory Cards into themes, open questions, interview flow, and recommended Capsule output.",
    doneWhen: "The Story Map clearly says what the session should capture and what the final Capsule should include."
  },
  {
    key: "guided_session",
    label: "6. Guided session",
    plainLabel: "Session",
    purpose: "Capture the heart of the story with prepared prompts instead of starting from scratch.",
    ownerAction: "Schedule or attend the guided session.",
    contributorAction: "Participate if invited, or send final voice notes before the session.",
    staffAction: "Guide the interview using the Story Map, photos, objects, rooms, and family questions.",
    doneWhen: "The core interview or recording session is complete."
  },
  {
    key: "produce_capsule",
    label: "7. Produce the Story Capsule",
    plainLabel: "Produce",
    purpose: "Edit the strongest material into a finished keepsake.",
    ownerAction: "Review the draft if requested.",
    contributorAction: "No action unless staff asks for clarification.",
    staffAction: "Prepare edited story sections, pull quotes, captions, voice excerpts, and printable files.",
    doneWhen: "A draft Story Capsule exists with the agreed deliverables."
  },
  {
    key: "deliver_capsule",
    label: "8. Deliver and keep",
    plainLabel: "Deliver",
    purpose: "Give the family one finished place to return to the story.",
    ownerAction: "Open the Story Capsule, download files, share privately with family, and request add-ons if needed.",
    contributorAction: "Read, hear, and keep the finished Capsule with the family.",
    staffAction: "Mark the Capsule delivered and confirm the family can access it.",
    doneWhen: "The family can access the final Story Capsule."
  }
];

export function stepIndexForStatus(status?: string | null) {
  switch (status) {
    case "gathering_contributions":
      return 1;
    case "needs_staff_review":
      return 2;
    case "story_map_in_progress":
      return 4;
    case "ready_for_interview":
      return 5;
    case "interview_complete":
    case "capsule_production":
    case "client_review":
      return 6;
    case "delivered":
    case "complete":
      return 7;
    case "onboarding":
    default:
      return 1;
  }
}

export function currentWorkflowStep(status?: string | null) {
  return capsuleWorkflow[stepIndexForStatus(status)] ?? capsuleWorkflow[0];
}

export function nextWorkflowStep(status?: string | null) {
  const index = stepIndexForStatus(status);
  return capsuleWorkflow[Math.min(index + 1, capsuleWorkflow.length - 1)];
}

export function actionForRole(step: CapsuleWorkflowStep, role: WorkflowRole) {
  if (role === "staff") return step.staffAction;
  if (role === "contributor") return step.contributorAction;
  return step.ownerAction;
}

export function capsuleEndGoal() {
  return "Finished Story Capsule: edited story sections, pull quotes, captions, selected voice excerpts, and a private place the family can read, hear, share, print, and keep.";
}
