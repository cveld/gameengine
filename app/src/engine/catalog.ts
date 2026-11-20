// The games on the home page and how each one is opened.
// Adding a game: add an entry here (and, for a new URL, a rewrite in
// public/staticwebapp.config.json). Static games live in public/assets/<game>/.

export interface Embed {
  /** Fixed asset URL of the static game; never derived from user input. */
  src: string;
  /** "boxed": title bar with back button and a sized frame; "fit": the game fills the page. */
  layout: "boxed" | "fit";
  frameClass?: string;
  allow?: string;
  /** postMessage types from the game that navigate back, and where to. */
  back?: { message: string; target: string };
  /** postMessage type that asks the page to fill the screen (iPhone fullscreen fallback). */
  immersiveMessage?: string;
}

export interface Game {
  id: string;
  route: string;
  title: string;
  description: string;
  icon: { bootstrap?: string; emoji?: string };
  /** Not shown as a tile on the home page (reached via another page). */
  hidden?: boolean;
  embed?: Embed;
}

export const games: Game[] = [
  { id: "engine", route: "/engine", title: "Kaartspel-engine", description: "Maak of join een kaartspel", icon: { bootstrap: "bi-suit-spade-fill" } },
  { id: "memory", route: "/memory", title: "Geheugenspel", description: "Test je geheugen, samen met anderen live", icon: { bootstrap: "bi-grid-3x3-gap-fill" } },
  { id: "simon", route: "/simon", title: "Simon Says", description: "Onthoud de reeks en herhaal 'm", icon: { bootstrap: "bi-music-note-beamed" } },
  {
    id: "maze", route: "/maze", title: "Dungeon Maze", description: "Ontsnap uit het doolhof, ontwijk de duivels", icon: { bootstrap: "bi-bricks" },
    embed: { src: "/assets/maze/index.html", layout: "boxed", frameClass: "maze-frame" }
  },
  {
    id: "maze-rooms", route: "/maze-rooms", title: "Dungeon Maze - Kamers", description: "Zoek je weg van kamer naar kamer, langs duivels en diamanten", icon: { bootstrap: "bi-door-open-fill" },
    embed: { src: "/assets/maze-rooms/index.html", layout: "boxed", frameClass: "maze-frame" }
  },
  {
    id: "flappy-muis", route: "/flappy-muis", title: "Flappy Muis", description: "Fladder tussen de palen door en versla je beste score", icon: { emoji: "🐭" },
    embed: { src: "/assets/flappy-muis/index.html", layout: "boxed", frameClass: "flappy-frame" }
  },
  { id: "coop", route: "/coop", title: "Tandem Ruimteschip", description: "Co-op voor twee: samen één schip besturen, vang sterren en ontwijk rotsen", icon: { emoji: "🚀" } },
  { id: "orbit", route: "/orbit", title: "Orbit", description: "Classic 3D sculptures, or catch falling objects in WebXR", icon: { bootstrap: "bi-globe" } },
  {
    id: "orbit-catch", route: "/orbit/catch", title: "Orbit Catch — catch falling objects in WebXR", description: "", icon: { bootstrap: "bi-stars" }, hidden: true,
    embed: {
      src: "/assets/orbit-catch/index.html", layout: "fit", frameClass: "orbit-catch-frame", allow: "fullscreen; xr-spatial-tracking",
      back: { message: "orbit:back", target: "/orbit" }
    }
  },
  {
    id: "marble-race", route: "/marble-race", title: "Marble Race", description: "Twelve marbles race through a 3D obstacle course. Pick your favourite and see who wins!", icon: { emoji: "🏁" },
    embed: {
      src: "/assets/marble-race/index.html", layout: "fit", frameClass: "marble-race-frame", allow: "fullscreen",
      back: { message: "marble:back", target: "/" }, immersiveMessage: "marble:immersive"
    }
  }
];

export function gameForPath(pathname: string): Game | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  return games.find(g => g.route === path);
}
