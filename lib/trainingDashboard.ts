export type TrainingCoachRole = "Chief Trainer" | "Lead Coach" | "Senior Coach" | "Coach";
export type CoachSignal = "celebrate" | "steady" | "attention";
export type TraineeStage = "attachment" | "second_interview" | "shadowing" | "cleared";
export type AttendanceStatus = "attended" | "makeup_required" | "absent";

export type TrainingFeedback = {
  id: string;
  authorRole: "Lead" | "Peer" | "Chief Trainer";
  date: string;
  sentiment: "positive" | "negative";
  text: string;
};

export type TrainingCoachProfile = {
  id: string;
  name: string;
  role: TrainingCoachRole;
  reportsToId: string | null;
  centres: string[];
  programmes: string[];
  assessment: {
    failCount: number;
    passCount: number;
  };
  attachmentHost: boolean;
  shadowingHost: boolean;
  feedback: TrainingFeedback[];
};

export type TrainingAttendanceEntry = {
  id: string;
  coachId: string;
  date: string;
  focus: string;
  hours: number;
  session: string;
  status: AttendanceStatus;
};

export type TrainingTrainee = {
  id: string;
  name: string;
  centre: string;
  mentorCoachId: string;
  programme: string;
  secondInterviewDate: string | null;
  secondInterviewPassed: boolean;
  stage: TraineeStage;
  attendance: TrainingAttendanceEntry[];
};

export const attachmentRequiredHours = 30;

export const trainingCoaches: TrainingCoachProfile[] = [
  {
    id: "chief-tyrone",
    name: "Tyrone",
    role: "Chief Trainer",
    reportsToId: null,
    centres: ["All"],
    programmes: ["Learn to Swim", "Race Team", "Baby Class"],
    assessment: { failCount: 7, passCount: 86 },
    attachmentHost: true,
    shadowingHost: true,
    feedback: [
      {
        id: "fb-tyrone-1",
        authorRole: "Lead",
        date: "2026-07-18",
        sentiment: "positive",
        text: "Clear debriefs and strong correction sequence for nervous swimmers."
      }
    ]
  },
  {
    id: "lead-jim",
    name: "Jim",
    role: "Lead Coach",
    reportsToId: "chief-tyrone",
    centres: ["SAAC"],
    programmes: ["Learn to Swim"],
    assessment: { failCount: 11, passCount: 74 },
    attachmentHost: true,
    shadowingHost: true,
    feedback: [
      {
        id: "fb-jim-1",
        authorRole: "Chief Trainer",
        date: "2026-07-22",
        sentiment: "positive",
        text: "Good class control across Saturday AM, PM, and Sunday PM sessions."
      },
      {
        id: "fb-jim-2",
        authorRole: "Peer",
        date: "2026-07-28",
        sentiment: "positive",
        text: "Gives trainee coaches useful poolside prompts without taking over."
      }
    ]
  },
  {
    id: "lead-taro",
    name: "Taro",
    role: "Lead Coach",
    reportsToId: "chief-tyrone",
    centres: ["YMCA", "ACSBR"],
    programmes: ["Learn to Swim", "Race Team"],
    assessment: { failCount: 9, passCount: 64 },
    attachmentHost: true,
    shadowingHost: true,
    feedback: [
      {
        id: "fb-taro-1",
        authorRole: "Lead",
        date: "2026-07-20",
        sentiment: "positive",
        text: "Strong technical explanation for freestyle and breathing progressions."
      }
    ]
  },
  {
    id: "coach-julia",
    name: "Julia",
    role: "Senior Coach",
    reportsToId: "lead-jim",
    centres: ["SAAC"],
    programmes: ["Learn to Swim"],
    assessment: { failCount: 12, passCount: 98 },
    attachmentHost: true,
    shadowingHost: false,
    feedback: [
      {
        id: "fb-julia-1",
        authorRole: "Lead",
        date: "2026-07-15",
        sentiment: "positive",
        text: "High session load but still maintains consistent assessment outcomes."
      }
    ]
  },
  {
    id: "coach-ben",
    name: "Benjamin",
    role: "Coach",
    reportsToId: "lead-taro",
    centres: ["YMCA"],
    programmes: ["Learn to Swim"],
    assessment: { failCount: 14, passCount: 38 },
    attachmentHost: false,
    shadowingHost: false,
    feedback: [
      {
        id: "fb-ben-1",
        authorRole: "Lead",
        date: "2026-07-26",
        sentiment: "negative",
        text: "Needs closer support on differentiating drills for mixed ability lanes."
      },
      {
        id: "fb-ben-2",
        authorRole: "Peer",
        date: "2026-07-30",
        sentiment: "negative",
        text: "Lesson pacing can drift when class size is high."
      }
    ]
  },
  {
    id: "coach-carmen",
    name: "Carmen",
    role: "Coach",
    reportsToId: "lead-jim",
    centres: ["SAAC"],
    programmes: ["Baby Class", "Learn to Swim"],
    assessment: { failCount: 4, passCount: 42 },
    attachmentHost: false,
    shadowingHost: true,
    feedback: [
      {
        id: "fb-carmen-1",
        authorRole: "Peer",
        date: "2026-07-19",
        sentiment: "positive",
        text: "Very patient with parent communication and first water-confidence classes."
      }
    ]
  }
];

export const initialTrainingTrainees: TrainingTrainee[] = [
  {
    id: "trainee-gideon",
    name: "Gideon",
    centre: "SAAC",
    mentorCoachId: "coach-julia",
    programme: "Learn to Swim",
    secondInterviewDate: null,
    secondInterviewPassed: false,
    stage: "attachment",
    attendance: [
      {
        id: "att-gideon-1",
        coachId: "coach-julia",
        date: "2026-07-12",
        focus: "Class flow and safety positioning",
        hours: 4,
        session: "Saturday AM",
        status: "attended"
      },
      {
        id: "att-gideon-2",
        coachId: "lead-jim",
        date: "2026-07-19",
        focus: "Beginner correction language",
        hours: 5,
        session: "Saturday PM",
        status: "attended"
      }
    ]
  },
  {
    id: "trainee-natalie",
    name: "Natalie",
    centre: "YMCA",
    mentorCoachId: "lead-taro",
    programme: "Learn to Swim",
    secondInterviewDate: "2026-08-17",
    secondInterviewPassed: false,
    stage: "second_interview",
    attendance: [
      {
        id: "att-natalie-1",
        coachId: "lead-taro",
        date: "2026-07-06",
        focus: "Lane management",
        hours: 12,
        session: "Sunday AM",
        status: "attended"
      },
      {
        id: "att-natalie-2",
        coachId: "lead-taro",
        date: "2026-07-13",
        focus: "Progression planning",
        hours: 18,
        session: "Sunday AM",
        status: "attended"
      }
    ]
  },
  {
    id: "trainee-amelia",
    name: "Amelia",
    centre: "ACSBR",
    mentorCoachId: "lead-taro",
    programme: "Race Team",
    secondInterviewDate: "2026-07-28",
    secondInterviewPassed: true,
    stage: "shadowing",
    attendance: [
      {
        id: "att-amelia-1",
        coachId: "lead-taro",
        date: "2026-07-05",
        focus: "Race Team warm-up and cooldown",
        hours: 30,
        session: "Saturday PM",
        status: "attended"
      }
    ]
  }
];

export function getCoachPassRate(coach: TrainingCoachProfile) {
  const total = coach.assessment.passCount + coach.assessment.failCount;

  return total > 0 ? Math.round((coach.assessment.passCount / total) * 100) : 0;
}

export function getCoachSignal(coach: TrainingCoachProfile): CoachSignal {
  const passRate = getCoachPassRate(coach);
  const negativeFeedback = coach.feedback.filter((item) => item.sentiment === "negative").length;

  if (passRate >= 85 && negativeFeedback === 0) {
    return "celebrate";
  }

  if (passRate < 75 || negativeFeedback >= 2) {
    return "attention";
  }

  return "steady";
}

export function getCoachRecommendation(coach: TrainingCoachProfile) {
  const signal = getCoachSignal(coach);

  if (signal === "attention") {
    return "Needs support";
  }

  if (coach.attachmentHost && coach.shadowingHost) {
    return "Attachment and shadowing host";
  }

  if (coach.attachmentHost) {
    return "Attachment host";
  }

  if (coach.shadowingHost) {
    return "Shadowing host";
  }

  return "Observe before assigning";
}

export function getTraineeCompletedHours(trainee: TrainingTrainee) {
  return trainee.attendance
    .filter((entry) => entry.status === "attended")
    .reduce((total, entry) => total + Number(entry.hours || 0), 0);
}

export function getTraineeProgress(trainee: TrainingTrainee) {
  return Math.min(100, Math.round((getTraineeCompletedHours(trainee) / attachmentRequiredHours) * 100));
}

export function getTraineeNextStep(trainee: TrainingTrainee) {
  const hours = getTraineeCompletedHours(trainee);

  if (trainee.stage === "cleared") {
    return "Cleared for deployment";
  }

  if (trainee.stage === "shadowing") {
    return "Assign shadowing coach";
  }

  if (trainee.stage === "second_interview") {
    return trainee.secondInterviewDate ? "Attend second interview" : "Schedule second interview";
  }

  if (hours >= attachmentRequiredHours) {
    return "Schedule second interview";
  }

  return `${attachmentRequiredHours - hours}h attachment remaining`;
}

export function formatTraineeStage(stage: TraineeStage) {
  switch (stage) {
    case "attachment":
      return "Attachment";
    case "second_interview":
      return "Second interview";
    case "shadowing":
      return "Shadowing";
    case "cleared":
      return "Cleared";
  }
}
