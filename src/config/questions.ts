export type Answers = {
  name: string;
  contact: string;
  location: string;
  residency: string;
  motivation: string;
  work: string;
  availability: string;
  video: string;
};

export type Question = {
  key: keyof Answers;
  label: string;
  prompt: string;
  hint: string;
  inputModal?: boolean;
};

export const questions: Question[] = [
  {
    key: "name",
    label: "Name",
    prompt: "Zuzu here, residency dog agent on duty. First sniff, hooman — what do they call you?",
    hint: "Name"
  },
  {
    key: "contact",
    label: "Contact",
    prompt: "Good. Now where do I send the hoomans when they want to fetch you back? Email or phone, your pick.",
    hint: "Email or phone",
    inputModal: true
  },
  {
    key: "location",
    label: "Location",
    prompt: "Where are you parked right now, hooman? City and country will do.",
    hint: "City, country"
  },
  {
    key: "residency",
    label: "Residency",
    prompt: "Which residency are you sniffing around for? Don't be shy. I judge weak pitches lovingly.",
    hint: "Residency name or type"
  },
  {
    key: "motivation",
    label: "Why Join",
    prompt: "Why this one? And no polished hooman answers, please. Give me the real reason. The one that wags your tail.",
    hint: "Your reason"
  },
  {
    key: "work",
    label: "Current Work",
    prompt: "What are you building, making, or chasing right now? Treat me like a curious dog with too many questions.",
    hint: "Your work or curiosity"
  },
  {
    key: "availability",
    label: "Availability",
    prompt: "When can you actually show up? Dates, month, vibes — anything works, just don't say soon.",
    hint: "Preferred dates"
  },
  {
    key: "video",
    label: "Video",
    prompt:
      "Final test, hooman. Drop me a video link. One minute is enough. Who you are, what you're chasing, and why this residency should open the door.",
    hint: "Loom, YouTube, Drive, or video link",
    inputModal: true
  }
];

export const emptyAnswers: Answers = {
  name: "",
  contact: "",
  location: "",
  residency: "",
  motivation: "",
  work: "",
  availability: "",
  video: ""
};
