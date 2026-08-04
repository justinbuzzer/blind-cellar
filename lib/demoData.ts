import {
  Guest,
  GuestSubmission,
  TastingSession,
  WineAnswerKey,
  WineGuess,
} from "@/types/tasting";
import { bottleLabel } from "./codes";

const DEMO_SESSION_CODE = "DEMO-07";

const demoWines: WineAnswerKey[] = [
  {
    id: "demo-wine-a",
    code: bottleLabel(1),
    contributorName: "Alice",
    country: "France",
    region: "Rhône Valley",
    grapeBlendMode: "blend",
    grapeBlend: "Grenache / Syrah / Mourvèdre",
    producer: "Domaine de la Janasse",
    wineName: "Chaupin",
    vintage: "2019",
    wineStyle: "red",
    tastingOrder: 1,
    hostNotes: "Bright red fruit, garrigue, silky tannins.",
  },
  {
    id: "demo-wine-b",
    code: bottleLabel(2),
    contributorName: "Ben",
    country: "Italy",
    region: "Piedmont",
    grapeBlendMode: "single",
    grapeBlend: "Nebbiolo",
    producer: "Giacomo Conterno",
    wineName: "Cascina Francia",
    vintage: "2016",
    wineStyle: "red",
    tastingOrder: 2,
    hostNotes: "Tar and roses, firm structure, very long finish.",
  },
  {
    id: "demo-wine-c",
    code: bottleLabel(3),
    contributorName: "Chidi",
    country: "New Zealand",
    region: "Marlborough",
    grapeBlendMode: "single",
    grapeBlend: "Sauvignon Blanc",
    producer: "Cloudy Bay",
    wineName: "Sauvignon Blanc",
    vintage: "2022",
    wineStyle: "white",
    tastingOrder: 3,
    hostNotes: "Passionfruit and lime zest, crisp acidity.",
  },
];

function guess(
  wineId: string,
  fields: Omit<WineGuess, "wineId" | "selectedGrapes" | "otherGrapesText">
): WineGuess {
  return { wineId, selectedGrapes: [], otherGrapesText: "", ...fields };
}

const demoGuests: Guest[] = [
  { id: "demo-guest-alice", name: "Alice", joinedAt: new Date().toISOString() },
  { id: "demo-guest-ben", name: "Ben", joinedAt: new Date().toISOString() },
  { id: "demo-guest-chidi", name: "Chidi", joinedAt: new Date().toISOString() },
];

const demoSubmissions: GuestSubmission[] = [
  {
    id: "demo-submission-alice",
    guestId: "demo-guest-alice",
    guestName: "Alice",
    sessionCode: DEMO_SESSION_CODE,
    locked: true,
    submittedAt: new Date().toISOString(),
    guesses: [
      guess("demo-wine-a", {
        country: "France",
        region: "Rhône Valley",
        grapeBlendMode: "single",
        grapeBlend: "Grenache",
        producer: "Domaine de la Janasse",
        wineName: "Chaupin",
        vintage: "2019",
        rating: 89,
        confidence: "high",
        note: "Peppery and warm, classic southern Rhone.",
      }),
      guess("demo-wine-b", {
        country: "Italy",
        region: "Piedmont",
        grapeBlendMode: "single",
        grapeBlend: "Nebbiolo",
        producer: "Giacomo Conterno",
        wineName: "Cascina Francia",
        vintage: "2016",
        rating: 95,
        confidence: "high",
        note: "Structured, floral, clearly serious Piedmont.",
      }),
      guess("demo-wine-c", {
        country: "New Zealand",
        region: "Marlborough",
        grapeBlendMode: "single",
        grapeBlend: "Sauvignon Blanc",
        producer: "Cloudy Bay",
        wineName: "Sauvignon Blanc",
        vintage: "2021",
        rating: 84,
        confidence: "medium",
        note: "",
      }),
    ],
  },
  {
    id: "demo-submission-ben",
    guestId: "demo-guest-ben",
    guestName: "Ben",
    sessionCode: DEMO_SESSION_CODE,
    locked: true,
    submittedAt: new Date().toISOString(),
    guesses: [
      guess("demo-wine-a", {
        country: "France",
        region: "Rhône Valley",
        grapeBlendMode: "blend",
        grapeBlend: "Grenache / Syrah / Mourvèdre",
        producer: "Domaine de la Janasse",
        wineName: "Chaupin",
        vintage: "2018",
        rating: 92,
        confidence: "medium",
        note: "",
      }),
      guess("demo-wine-b", {
        country: "Italy",
        region: "Piedmont",
        grapeBlendMode: "single",
        grapeBlend: "Nebbiolo",
        producer: "Conterno",
        wineName: "Cascina Francia",
        vintage: "2015",
        rating: 90,
        confidence: "low",
        note: "Tough to place exactly, but clearly top-tier Piedmont.",
      }),
      guess("demo-wine-c", {
        country: "New Zealand",
        region: "Marlborough",
        grapeBlendMode: "single",
        grapeBlend: "Sauvignon Blanc",
        producer: "Villa Maria",
        wineName: "Sauvignon Blanc",
        vintage: "2022",
        rating: 78,
        confidence: "medium",
        note: "",
      }),
    ],
  },
  {
    id: "demo-submission-chidi",
    guestId: "demo-guest-chidi",
    guestName: "Chidi",
    sessionCode: DEMO_SESSION_CODE,
    locked: true,
    submittedAt: new Date().toISOString(),
    guesses: [
      guess("demo-wine-a", {
        country: "France",
        region: "Rhône Valley",
        grapeBlendMode: "blend",
        grapeBlend: "Syrah / Mourvèdre",
        producer: "Domaine Janasse",
        wineName: "Chaupin",
        vintage: "2019",
        rating: 85,
        confidence: "low",
        note: "",
      }),
      guess("demo-wine-b", {
        country: "Italy",
        region: "Piedmont",
        grapeBlendMode: "single",
        grapeBlend: "Nebbiolo",
        producer: "Giacomo Conterno",
        wineName: "Monfortino",
        vintage: "2016",
        rating: 97,
        confidence: "high",
        note: "One of the best things I've tasted this year.",
      }),
      guess("demo-wine-c", {
        country: "New Zealand",
        region: "Marlborough",
        grapeBlendMode: "single",
        grapeBlend: "Sauvignon Blanc",
        producer: "Cloudy Bay",
        wineName: "Sauvignon Blanc",
        vintage: "2022",
        rating: 88,
        confidence: "high",
        note: "Textbook Marlborough, very confident on this one.",
      }),
    ],
  },
];

export function buildDemoTasting(): {
  session: TastingSession;
  guests: Guest[];
  submissions: GuestSubmission[];
} {
  const session: TastingSession = {
    id: "demo-session",
    code: DEMO_SESSION_CODE,
    title: "Old World vs New World Showdown",
    date: new Date().toISOString().slice(0, 10),
    wines: demoWines,
    status: "collecting",
    createdAt: new Date().toISOString(),
  };

  return {
    session,
    guests: demoGuests,
    submissions: demoSubmissions,
  };
}
