export interface SpawnProfileRow {
  label: string;
  noFood: boolean;
  nestSize: number; nestShare: number; nestCap: number;
  nestWeights: Record<string, number>;
  nestPace: number;
  crowdOn: boolean; crowdEnemyFirst: number; crowdEnemyNext: number; crowdEnemyKeep: number; crowdTeamFirst: number; crowdTeamKeep: number;
  crowdMargin: number;
  crowdKinds: Record<string, number>;
  outsideWeights: Record<string, number>;
  tierOneIn: number[];
  crasherOneIn: number; nestCrasherOneIn: number;
  shiny: number; legendary: number; shadow: number; rainbow: number; trans: number;
  gemOneIn: number; jewelOneIn: number; eggToGem: boolean;
  polyhedraOneIn: number;
  scaledOneIn: number; scaledWeights: Record<string, number>; scaledCap: number;
  relicOneIn: number; relicWeights: Record<string, number>;
  foodCap: number;
}

export const SPAWN_PROFILES: Record<string, SpawnProfileRow> = {
  "ordinary": {"label":"Ordinary","noFood":false,"nestSize":24,"nestShare":10,"nestCap":15,"nestWeights":{"pentagon":100,"hexagon":15},"nestPace":0.74,"crowdOn":true,"crowdEnemyFirst":1,"crowdEnemyNext":0.15,"crowdEnemyKeep":0.35,"crowdTeamFirst":0.1,"crowdTeamKeep":0.3,"crowdMargin":50,"crowdKinds":{"hexagon":1},"outsideWeights":{"egg":100,"square":94,"triangle":70},"tierOneIn":[0,5.9,16,100000,1000000,10000000],"crasherOneIn":17,"nestCrasherOneIn":30,"shiny":50000,"legendary":1000000,"shadow":3000000,"rainbow":76000000,"trans":152000000,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":570000000,"scaledOneIn":1000000,"scaledWeights":{"betaPentagon":3,"alphaPentagon":2},"scaledCap":15,"relicOneIn":0,"relicWeights":{},"foodCap":70},
  "magicMaze": {"label":"Magic Maze","noFood":false,"nestSize":24,"nestShare":10,"nestCap":15,"nestWeights":{"pentagon":100,"hexagon":15},"nestPace":0.74,"crowdOn":true,"crowdEnemyFirst":1,"crowdEnemyNext":0.15,"crowdEnemyKeep":0.35,"crowdTeamFirst":0.1,"crowdTeamKeep":0.3,"crowdMargin":50,"crowdKinds":{"hexagon":1},"outsideWeights":{"egg":100,"square":94,"triangle":70},"tierOneIn":[0,5.9,16,100000,1000000,10000000],"crasherOneIn":17,"nestCrasherOneIn":30,"shiny":50000,"legendary":1000000,"shadow":3000000,"rainbow":76000000,"trans":152000000,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":570000000,"scaledOneIn":1000000,"scaledWeights":{"betaPentagon":3,"alphaPentagon":2},"scaledCap":15,"relicOneIn":90,"relicWeights":{"square":300,"triangle":120,"pentagon":30,"betaPentagon":6,"alphaPentagon":1,"egg":1,"hexagon":1},"foodCap":70},
  "labyrinth": {"label":"Labyrinth","noFood":false,"nestSize":0,"nestShare":0,"nestCap":0,"nestWeights":{},"nestPace":0,"crowdOn":false,"crowdEnemyFirst":0,"crowdEnemyNext":0,"crowdEnemyKeep":0,"crowdTeamFirst":0,"crowdTeamKeep":0,"crowdMargin":0,"crowdKinds":{},"outsideWeights":{"egg":100,"square":72,"triangle":61,"pentagon":23,"hexagon":2},"tierOneIn":[0,7.8,16,80,800,10000000],"crasherOneIn":40,"nestCrasherOneIn":40,"shiny":45,"legendary":900,"shadow":2700,"rainbow":68400,"trans":136800,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":570000000,"scaledOneIn":1000000,"scaledWeights":{"betaPentagon":3,"alphaPentagon":2},"scaledCap":15,"relicOneIn":0,"relicWeights":{},"foodCap":420},
  "odMain": {"label":"Old Dreadnoughts Main","noFood":false,"nestSize":25,"nestShare":53,"nestCap":40,"nestWeights":{"pentagon":100},"nestPace":0,"crowdOn":false,"crowdEnemyFirst":0,"crowdEnemyNext":0,"crowdEnemyKeep":0,"crowdTeamFirst":0,"crowdTeamKeep":0,"crowdMargin":0,"crowdKinds":{},"outsideWeights":{"egg":100,"square":97,"triangle":68,"pentagon":5},"tierOneIn":[0,100000,1000000,10000000,100000000,1000000000],"crasherOneIn":10000,"nestCrasherOneIn":10000,"shiny":600,"legendary":3000,"shadow":9000,"rainbow":228000,"trans":456000,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":570000000,"scaledOneIn":1.55,"scaledWeights":{"betaPentagon":44,"alphaPentagon":21,"odHexagon":2.4,"odSeptagon":2.3,"odOctagon":0.5,"odNonagon":3.3},"scaledCap":25,"relicOneIn":0,"relicWeights":{},"foodCap":140},
  "odMaze": {"label":"Old Labyrinth","noFood":false,"nestSize":0,"nestShare":0,"nestCap":0,"nestWeights":{},"nestPace":0,"crowdOn":false,"crowdEnemyFirst":0,"crowdEnemyNext":0,"crowdEnemyKeep":0,"crowdTeamFirst":0,"crowdTeamKeep":0,"crowdMargin":0,"crowdKinds":{},"outsideWeights":{"egg":5,"square":13,"triangle":20,"pentagon":100},"tierOneIn":[0,100000,1000000,10000000,100000000,1000000000],"crasherOneIn":10000,"nestCrasherOneIn":10000,"shiny":23,"legendary":74,"shadow":209,"rainbow":710,"trans":1500,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":2000,"scaledOneIn":1.55,"scaledWeights":{"betaPentagon":100,"alphaPentagon":83},"scaledCap":200,"relicOneIn":0,"relicWeights":{},"foodCap":390},
  "siege": {"label":"Siege","noFood":false,"nestSize":0,"nestShare":0,"nestCap":0,"nestWeights":{},"nestPace":0,"crowdOn":false,"crowdEnemyFirst":0,"crowdEnemyNext":0,"crowdEnemyKeep":0,"crowdTeamFirst":0,"crowdTeamKeep":0,"crowdMargin":0,"crowdKinds":{},"outsideWeights":{"egg":100,"square":76,"triangle":47,"pentagon":27},"tierOneIn":[0,100000,1000000,10000000,100000000,1000000000],"crasherOneIn":10000,"nestCrasherOneIn":10000,"shiny":50000,"legendary":1000000,"shadow":3000000,"rainbow":76000000,"trans":152000000,"gemOneIn":5000000,"jewelOneIn":100000000,"eggToGem":false,"polyhedraOneIn":570000000,"scaledOneIn":4.7,"scaledWeights":{"betaPentagon":20,"alphaPentagon":1},"scaledCap":15,"relicOneIn":0,"relicWeights":{},"foodCap":40},
  "none": {"label":"No food","noFood":true,"nestSize":0,"nestShare":0,"nestCap":0,"nestWeights":{},"nestPace":0,"crowdOn":false,"crowdEnemyFirst":0,"crowdEnemyNext":0,"crowdEnemyKeep":0,"crowdTeamFirst":0,"crowdTeamKeep":0,"crowdMargin":0,"crowdKinds":{},"outsideWeights":{},"tierOneIn":[0,0,0,0,0,0],"crasherOneIn":0,"nestCrasherOneIn":0,"shiny":0,"legendary":0,"shadow":0,"rainbow":0,"trans":0,"gemOneIn":0,"jewelOneIn":0,"eggToGem":false,"polyhedraOneIn":0,"scaledOneIn":0,"scaledWeights":{},"scaledCap":15,"relicOneIn":0,"relicWeights":{},"foodCap":70},
};

export const SPAWN_PROFILE_IDS: readonly string[] = ["ordinary","magicMaze","labyrinth","odMain","odMaze","siege","none"];

export const SPAWN_PROFILE_OF_WORLD: Record<string, string> = {"siege-citadel":"siege","siege-fortress":"siege","siege-blitz":"siege","labyrinth":"labyrinth","magic-maze":"magicMaze","open-3-tag":"none","open-4-tag":"none","open-maze-3-tag":"none","open-maze-4-tag":"none","soccer":"none","nexus":"none","forge":"none"};

export const SPAWN_PROFILE_SPECIAL: Record<string, string> = {"siege":"siege","oldDreadnoughts.main":"odMain","oldDreadnoughts.maze":"odMaze","oldDreadnoughts.forge":"none"};

export const SPAWN_PROFILE_DEFAULT = "ordinary";

export const SPAWN_CHART_VERSION = 5;
