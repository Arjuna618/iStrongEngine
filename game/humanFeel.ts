import { AI_CONSTANTS } from '../types';
import type { Turret, EnemyTank } from '../types';

const FEEL_LIVE_DEFAULT = !(typeof process !== 'undefined' && !!process.versions && !!process.versions.node);
export const FEEL_LIVE: boolean = (() => {
  let v = '';
  if (typeof process !== 'undefined' && !!process.env && typeof process.env.ISTRONG_FEEL === 'string') v = process.env.ISTRONG_FEEL;
  else if (typeof location !== 'undefined') { const m = /[?&]feel=([01])(?:&|$)/.exec(location.search); if (m) v = m[1]; }
  return v === '1' ? true : v === '0' ? false : FEEL_LIVE_DEFAULT;
})();

export function hfHash(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a | 0, 0x9E3779B1) ^ Math.imul(b | 0, 0x85EBCA77)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D);
  h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hfNoise(seed: number, salt: number, nowMs: number, periodMs: number): number {
  const x = nowMs / periodMs, i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hfHash(seed, salt, i), b = hfHash(seed, salt, i + 1);
  return a + (b - a) * u;
}
export function hfSeedOf(g1: number, g2: number, g3: number, g4: number, g5: number): number {
  let h = 0x2545F491;
  h = Math.imul(h ^ ((g1 * 4294967296) >>> 0), 0x9E3779B1); h ^= h >>> 15;
  h = Math.imul(h ^ ((g2 * 4294967296) >>> 0), 0x85EBCA77); h ^= h >>> 13;
  h = Math.imul(h ^ ((g3 * 4294967296) >>> 0), 0xC2B2AE3D); h ^= h >>> 16;
  h = Math.imul(h ^ ((g4 * 4294967296) >>> 0), 0x27D4EB2F); h ^= h >>> 15;
  h = Math.imul(h ^ ((g5 * 4294967296) >>> 0), 0x165667B1); h ^= h >>> 14;
  return (h >>> 0) || 1;
}

export interface FeelRow { key: string; ai: string; title: string; tip: string; strength: boolean; moodLo: number; step: string }
export const FEEL_ROWS: FeelRow[] = [
  { key: 'sight', ai: 'HF_SIGHT', title: 'Sight Like A Screen', step: '1.2', strength: false, moodLo: 1,
    tip: 'A bot notices only the tanks a player of its size would see on his screen, wider than it is tall, and it sees farther as it grows. Off: every bot sees a circle of a fixed size.' },
  { key: 'keys', ai: 'HF_KEYS', title: 'Moves By Keys', step: '1.3', strength: false, moodLo: 1,
    tip: 'Bots drive in the 8 directions of a keyboard and change keys the way players do. Bosses drive the same way, except a boss that charges. Off: they steer at any angle.' },
  { key: 'hand', ai: 'HF_HAND', title: 'Each Bot Its Own Hand', step: '2.1', strength: false, moodLo: 1,
    tip: 'Every bot aims with a hand of its own, a little shaky or steady, and no swing is like the last: quick when it is in danger, slower at food, lazy on its way. A bot needs a moment to react to a new target, as a player does. Off: every bot has the same hand and reacts at once.' },
  { key: 'look', ai: 'HF_LOOK', title: 'Looks Around While Travelling', step: '2.2', strength: true, moodLo: 0.5,
    tip: 'A bot on its way looks ahead, at things around it, to a side or behind it, each for a moment, instead of staring where it drives or at a target hidden behind a wall. Its aim does not turn in step with its keys: when its way turns, its eyes follow later or not at all. Off: it faces where it drives.' },
  { key: 'swing', ai: 'HF_SWING', title: 'Aim Rests And Swings', step: '2.3', strength: false, moodLo: 1,
    tip: 'A bot holds its aim still and moves it in short swings when its target has moved, as a hand on a mouse does. A big swing lands a little short of its mark or past it and is put right a moment later. Off: its aim glides after its target all the time.' },
  { key: 'boost', ai: 'HF_BOOST', title: 'Recoil Boost', step: '2.4', strength: true, moodLo: 0.35,
    tip: 'A bot whose guns push it one way turns that push along its way and fires to travel faster, most of the time it travels, when nobody is shooting it and no enemy is close. A slow heavy gun counts as much as a fast one. Never snipers, tanks with a weak push such as a Shotgun, or tanks whose guns cancel each other. Off: bots never do it.' },
  { key: 'trust', ai: 'HF_TRUST', title: 'Peace In Free For All', step: '6.1', strength: true, moodLo: 0.3,
    tip: 'In free for all modes many bots leave a tank alone that has not hurt them, you included: mostly the ones that are smaller or weaker than that tank, or already busy with another fight. Stronger bots do so less, and may turn on a tank later when they feel safe. A bot that is hurt too much becomes an enemy until it has healed, sooner the less health it has left. Rare in duos and squads, never in team modes. Off: bots attack on sight.' },
  { key: 'crowd', ai: 'HF_CROWD', title: 'One Fight At A Time', step: '3.7', strength: true, moodLo: 0.6,
    tip: 'The more tanks already fight a target, the less a bot joins in, each bot with its own limit, so bots spread over their opponents and you are not picked by every bot that sees you. A badly hurt target is still taken. Off: every bot takes the best target it sees.' },
  { key: 'spin', ai: 'HF_SPIN', title: 'Spin Under Crossfire', step: '3.2', strength: true, moodLo: 0.4,
    tip: 'A tank that fires to several sides and fires fast may spin for a moment while it fights, above all when two or more enemies shoot it from different sides. Never a tank that fires only forward, a sniper or a slow shooter. Such tanks of the Spinning Tanks group stop their endless spin. Off: only that group spins, always.' },
  { key: 'sweep', ai: 'HF_SWEEP', title: 'Spread Sweep', step: '3.3', strength: true, moodLo: 0.4,
    tip: 'A fast firing tank sometimes swings its aim a little to both sides of its target to spread its shots, for a second or two. Never snipers or slow shooters. Off: never.' },
  { key: 'aim', ai: 'HF_AIM', title: 'Human Aim Lead', step: '3.4', strength: false, moodLo: 1,
    tip: 'Bots lead a moving target only partly, each bot by its own share, as players do. Off: every bot leads its target exactly.' },
  { key: 'stops', ai: 'HF_STOPS', title: 'Short Stops', step: '4.1', strength: true, moodLo: 0.4,
    tip: 'A bot on its way sometimes stops for a second or two when nothing threatens it, more often in free for all than in team modes. A shot that flies at it ends the stop at once. In a team fight a gun tank also takes a spot: while it is shooting a tank inside its reach and nothing threatens it, it stands for a while, and walks back in only when its recoil has pushed it out of reach. A bot that shoots a body that stands still, a Dominator or a Sanctuary, does not circle it. It stays at its place and takes a short step to one side now and then. While the gun of that body points at it, or shots of a tank hit it, it keeps moving as in any other fight. Off: bots never stop on their way.' },
  { key: 'together', ai: 'HF_TOGETHER', title: 'No One Mind', step: '5.8', strength: true, moodLo: 0.5,
    tip: 'Teammates that see a mate in trouble each take their own moment before they decide to help, and fewer join when others already help, so a team never moves as one mind. Off: every mate decides in the same instant.' },
  { key: 'lines', ai: 'HF_LINES', title: 'Hold Lines', step: '5.1', strength: true, moodLo: 0.5,
    tip: 'A bot that fights beside teammates keeps its enemy farther off, as far as its gun and its sight allow, so a team fights from a line. A badly hurt enemy is still pressed. Off: every bot closes in to its own distance.' },
  { key: 'odds', ai: 'HF_ODDS', title: 'Team Push And Retreat', step: '5.3', strength: true, moodLo: 0.5,
    tip: 'A bot counts the teammates and the enemies near it. Outnumbered, it falls back. On the stronger side it presses in, slowly. Off: the numbers near it change nothing.' },
  { key: 'mates', ai: 'HF_MATES', title: 'Stays With Mates', step: '5.2', strength: true, moodLo: 0.5,
    tip: 'A team bot on its way with no teammate near it often walks over to one, more to a mate with a higher score. A team bot and the mates near it are a group, led by the one with the most score. When the enemy tanks the group sees are stronger than the group, the leader calls a fall back to a safer place before anyone is under fire. Each bot follows at its own moment, and they wait there for more mates before they go on. In a plain team match, the TDM and Open TDM cards with no other goal, each side has one leader, picked by chance at the start and then every 30 seconds the bot with the most score. The side gathers at its leader, goes to the middle of the map together, holds it, eats the shapes there and starts no fight far outside it. It closes ranks when a group of enemies comes in, and backs off together when it is clearly losing. A bot that sees a tank hit a mate goes to that tank to help, most of the time, and a fight far from the group is carried back to it. Off: team bots travel on their own, no group falls back and no side fights for the middle.' },
  { key: 'protect', ai: 'HF_PROTECT', title: 'Protectors', step: '5.4', strength: true, moodLo: 0.15,
    tip: 'Tanks that fire to nearly every side (a Hexa Tank, a Septa Trapper) may play protector in a team: they stay with their mates and follow them. How many do so changes from match to match. Off: no bot plays protector.' },
  { key: 'letgo', ai: 'HF_LETGO', title: 'Lets A Runner Go', step: '3.6', strength: true, moodLo: 0.5,
    tip: 'A bot whose target runs away often lets it go after a moment and leaves it alone for a while, more so in a free for all, less when the target is badly hurt. Off: a bot follows a running target as long as it can.' },
  { key: 'calm', ai: 'HF_CALM', title: 'Falls Back Calmly', step: '5.5', strength: true, moodLo: 0.5,
    tip: 'A hurt bot backs off calmly: its fear widens its fighting distance less, and when it runs it runs in short steps and keeps shooting, most of all in a free for all. Under a third of its health it runs for real. A tank with nothing to fire does not stop on the way, it just runs. Off: a hurt bot backs off at full speed.' },
  { key: 'smash', ai: 'HF_SMASH', title: 'Smashers Rest Their Aim', step: '8.1', strength: false, moodLo: 1,
    tip: 'A tank with no gun of its own (a Smasher) leaves its aim where it is and moves it only now and then, as a player on such a tank does. Off: it points its front at whatever it goes for.' },
  { key: 'wag', ai: 'HF_WAG', title: 'The Wiggle', step: '6.2', strength: true, moodLo: 0.4,
    tip: 'In a free for all, wiggle your aim left and right a few times or spin it round near a bot. A bot that is smaller or weaker than you often answers and leaves you alone, a much stronger one rarely, and almost any bot does while it is afraid or busy with another fight. Its answer is a wiggle of uneven swings, a few quick turns, or both. It is a peace for now, not for ever. Bots do the same with each other, only with a tank that is near and in clear sight. A bot wiggles only while another tank is on its own screen in clear sight. It stops its own wiggle when a boss, a sentry or a guard is on its screen or when the shots of a tank hit it. A bot with Auto Spin stops its spin for its wiggle. Needs Peace In Free For All. Off: a wiggle means nothing.' },
  { key: 'join', ai: 'HF_JOIN', title: 'Players Come And Go', step: '7.6', strength: true, moodLo: 1,
    tip: 'A bot that dies usually comes back under its own name with its own character, as a player who respawns. Sometimes it leaves instead, more often after several deaths, and a new player joins a while later. Off: every respawn is a new name.' },
  { key: 'focus', ai: 'HF_FOCUS', title: 'One Decision', step: '3.11', strength: true, moodLo: 0.6,
    tip: 'A bot that has picked an opponent stays on it for a few seconds instead of jumping between two targets. Most bots stay on the tank they charge for as long as they fight it. A bot turns to another tank when that one keeps hitting it and is nearer than its own target, or its own target no longer hurts it, or when that one is nearly dead. Off: a bot takes the best target of every moment.' },
  { key: 'goals', ai: 'HF_GOALS', title: 'Always A Goal', step: '7.7', strength: true, moodLo: 0.6,
    tip: 'A bot with nothing to do does not hang around one spot. It soon heads somewhere with a reason: toward its teammates and their fights, toward the middle of the map, or toward a tank it noticed firing just beyond its screen. A bot does not chase one piece of food for ever. After 5 to 9 seconds without reaching it, it leaves that shape and moves on, and it tries three times as long for a rare shape. Off: bots pick the places they know least.' },
  { key: 'spawn', ai: 'HF_SPAWN', title: 'Spawns Like A Player', step: '7.8', strength: false, moodLo: 1,
    tip: 'A bot stays in its spawn protection while an enemy tank is close. If the enemy does not leave before the protection runs out, the bot gives up that tank and spawns somewhere else. Living bots keep away from an enemy tank that is still protected. Teammates never mind each other. Off: a bot starts to play as soon as its upgrades are done.' },
  { key: 'owntime', ai: 'HF_OWNTIME', title: 'Own Moment', step: '2.5', strength: false, moodLo: 1,
    tip: 'No two bots do the same thing in the same instant. Each bot notices new food, a new opponent or a lost target after a moment of its own, longer when nothing threatens it, and its keys wait with its aim. Off: bots that see the same thing react together.' },
  { key: 'finger', ai: 'HF_FINGER', title: 'Fingers On Keys', step: '1.3b', strength: false, moodLo: 1,
    tip: 'A bot presses its keys the way fingers do: a key is held for a moment before the next change, and when it is pulled two ways at once it rests instead of shaking back and forth. A boss does the same, so it does not shake under fire. In a crowd of its own team a bot walks and fights straight on instead of weaving round every team mate, and a bot that guards a place walks to spots it can reach. Off: its keys may change at every step of the game.' },
  { key: 'cursor', ai: 'HF_CURSOR', title: 'Aims With A Mouse', step: '2.6', strength: false, moodLo: 1,
    tip: 'A bot aims with a mouse pointer of its own. The pointer rests, then moves in one quick stroke to its next place, lands a little off and is put right. A big turn flips the barrel in a moment and a small one glides, as a hand on a mouse does. Off: the barrel turns by angle at an even pace.' },
  { key: 'ready', ai: 'HF_READY', title: 'Combat Ready', step: '3.12', strength: false, moodLo: 1,
    tip: 'A bot keeps an eye on the nearest enemy tank. It does not fire backward for speed while an enemy near it is watching it, stands where it is going or stands where its shots would fly. Near an enemy it does not look around or stand idle, and a tank that keeps hitting it becomes its enemy at once. Off: it boosts, looks around and stops whoever is near.' },
  { key: 'sees', ai: 'HF_SEES', title: 'Aims At What It Sees', step: '3.13', strength: false, moodLo: 1,
    tip: 'A bot does not follow a tank with its aim through a wall. Its aim rests where it was when the tank went out of sight, and it reacts when the tank comes out again. When it chases a hidden tank it sometimes looks along its own way shortly before the corner. Off: its aim follows tanks through walls.' },
  { key: 'onefoe', ai: 'HF_ONEFOE', title: 'One Enemy At A Time', step: '4.8', strength: false, moodLo: 1,
    tip: 'A bot in a fight that a second tank also shoots at moves away from that second tank while it keeps fighting, round a corner when it can, so that it has to deal with one enemy at a time. Cornered, it stands and fights. Off: it stays in the crossfire.' },
  { key: 'mind', ai: 'HF_MIND', title: 'Minds Its Friends', step: '6.7', strength: false, moodLo: 1,
    tip: 'A bot keeps a tank it is at peace with out of its fire. When that tank stands in its line of fire, it holds its fire and steps to the side to get a clear line, at food too. It still fires at once to defend itself: at a round coming at it, or at a tank that attacks it. A tank that always fires lets go of its fire button while such a tank could be hit, and while it wiggles. Needs Peace In Free For All. Off: it fires whoever stands in the way.' },
  { key: 'gap', ai: 'HF_GAPDIST', title: 'Distance By Strength', step: '4.9', strength: true, moodLo: 1,
    tip: 'In a fight with another tank, a bot that is clearly the stronger one moves in closer than its normal distance, and a clearly weaker one stays farther away: 10 to 50 percent, by how far apart the two are in strength and health. A stronger bot that is afraid does not push in. Each bot does it a little differently. Bosses do it too. Tanks that ram are not changed, and a category can opt out (AI Behavior Categories, Keeps Its Own Distance). Against a tank whose single shot takes a big part of its health a bot fights from farther away, up to almost twice its normal distance, however strong the bot is. A bot that fears a tank\'s hit range, see Picks Its Fights, holds its fight with that tank from outside the distance that shot can fly, as far as the bot\'s own shot still reaches, and from that tank\'s side, where the bot can still see it. Off: every bot keeps its normal distance.' },
  { key: 'risk', ai: 'HF_RISK', title: 'Picks Its Fights', step: '3.14', strength: true, moodLo: 1,
    tip: 'Before a bot goes for a tank it looks at who else is around that tank. If the other enemies there could together overwhelm it, it leaves that tank alone, and it gives up a fight when the place fills with enemies. Brave bots dare more, careful ones less. Teammates near it count on its side. Every tank counts as what it really is, by the health it has left and its skill points, so a boss is held back by almost nothing. A tank that hurts it is still fought. A bot that runs away takes the way with the least risk: a place it reaches before its attacker where the way leads on, not a corner or a closed end. A bot remembers the way it walked for a minute and a half. When it runs away or backs off it takes that way before a way it has never walked, which may be a dead end, unless the way it knows has danger on it. It does not hide in a pocket with no way out. In a free for all a bot also thinks twice before it starts a fight with a tank that has more score than it has. The more score the other tank has, the smaller the chance, and brave bots dare more often. The chance never drops under 1 in 20. A tank that hurt it is still fought, and so is one that is nearly dead. A bot stays out of the hit range of a tank whose one shot would take a big part of its health: the area that shot can fly into and that tank can see. A bot that no Map Events effect leads counts that area a little bigger, because a lucky round flies faster than the others, and a shot from a tank that drives toward the bot flies farther. The chance is about that part. A shot that would kill it: almost always. Half of what it has left: about every second bot. A tenth: one bot in ten. Careful bots a little more often than brave ones, and a hurt bot more often than a healthy one. A bot whose own fire is heavier than that tank\'s and that would win the fight pushes in anyway. A bot that fears a hit range stays out of it at peace too, while it roams, at food and when it runs away, also when that tank is not the nearest one, and it remembers for a few seconds where such a tank left its screen. A bot that is hit by a tank it is not fighting takes cover from that tank, and a camping trapper ends its camp. It starts no fight with that tank unless its own shot reaches farther. A tank that stays close behind a bot that is giving way is shot at as the bot goes. Strong drones or minions that come at a bot, counted together, make it back away from them, behind cover when it can. Bots that stand together count their fire together: when it is heavier than the fire of the tank that leads the pack they back away less, and at twice its weight not at all. A bot that had to back away from a pack keeps out of the area of that tank for about a minute. A tank that leads drones, minions or a swarm still attacks, and keeps its body out of the range. A tank that itself hits very hard with one shot, like a Destroyer or a Big Mac, starts no fight with a drone tank that stands on open ground. When such a tank stands behind a wall near the corner ahead, the bot does not walk round that corner. It steps back until that tank could not hit it from the corner, waits, and after a few seconds it gives up and goes back the way it came. Off: a bot goes for a target wherever it stands, and runs to the place farthest from its attacker.' },
  { key: 'early', ai: 'HF_EARLYRUN', title: 'Runs Before It Is Too Late', step: '4.6b', strength: false, moodLo: 1,
    tip: 'A bot that is being hurt in a fight breaks off while it still can: the most careful ones at about 60 percent of their health, the bravest at about 40, a little different every time. It stays longer for a kill it is clearly winning. Tanks whose category never runs (Flee HP Threshold 0) are not changed. Off: a bot runs at the Flee HP Threshold of its category, or when its fear is full.' },
  { key: 'place', ai: 'HF_PLACE', title: 'Likes Its Own Ground', step: '4.4', strength: true, moodLo: 1,
    tip: 'A bot prefers the kind of place that suits its tank, goes there and stays. A maze map has three areas: the frame, which is its outer edge all the way round, the open middle, and the maze between them. Tanks that fire forward, trappers that fire where they look, smashers and rammers like the maze, then the frame. Swarm drone tanks and trappers that fire to many sides like the frame. Tanks that fire bullets to many sides like the middle. Drone and minion tanks like the maze. Once grown to half a corridor, those with drone guns at their sides like the frame, or the middle when they fire bullets too. Outside its area a bot walks to it, starts no fight and passes food by, less often the more rare the shape. It does not go to look at a tank it noticed firing beyond its screen. In its area it stays and lets go of a chase that would take it out. About half the bots are born in their own area where they have no team base. On a map with no maze, drone tanks and forward shooters stay near the rocks. Every bot follows it and takes a short break from it now and then. It is weaker in team modes. Off: every tank roams the same way.' },
  { key: 'quiet', ai: 'HF_QUIET', title: 'Goes To The Quiet Side', step: '4.6b', strength: false, moodLo: 1,
    tip: 'A bot that runs away counts enemy shots flying on its screen as danger, not only enemy tanks, and takes the way that is empty. A bot that two enemies shoot at once goes to a spot near it where only one of them can reach it, and fights from there. Food on a way is no danger unless it is hard to go round: eggs, plain squares, squares nested once and plain triangles never count, and a few shapes are walked round. Off: tanks, traps and every food shape but an egg count, shots do not, and a bot shot from two sides backs straight away from one of them.' },
  { key: 'dodge', ai: 'HF_DODGE', title: 'Steps Aside Or Shoots', step: '3.1', strength: false, moodLo: 1,
    tip: 'A bot decides once about a shot that flies at it. A shot that is heavy for the health it has left, and that it can get out of the way of, it steps aside from, with the key nearest to its way that takes it clear, while its guns stay on what they were doing. A shot it cannot get out of the way of, because it is too near, the bot is too big or slow, or walls leave no room, it shoots at, unless a tank that attacks it is in its sight. Light shots are mostly ignored. A bot that stands still steps aside as well. Careful bots step aside more often. Off: a bot leans a little away from every shot, and turns its guns to any shot it can reach when nobody attacks it.' },
  { key: 'keephid', ai: 'HF_KEEPHID', title: 'Keeps A Hidden Tank', step: '3.9', strength: false, moodLo: 1,
    tip: 'A bot that fights a tank it can only see from close, such as an invisible one, stays close enough to keep seeing it. When it loses that tank all the same, it stays near the place where it last saw it and keeps firing there for a few seconds before it gives up. It never knows more than it saw. Off: it backs away to its usual fighting distance, loses the hidden tank after about a second and walks off.' },
  { key: 'hurtaway', ai: 'HF_HURTAWAY', title: 'Hurt Bots Keep Away', step: '4.6c', strength: false, moodLo: 1,
    tip: 'A bot under half its health that is not in a fight keeps away from enemy tanks it can see. It walks off, leaves the food beside them, and starts no fight, until it is back over 70 percent of its health. It still fights back when it is hurt, and it finishes a tank that is nearly dead. Careful bots keep a wider distance. Needs Combat Ready. Off: a hurt bot roams, farms and picks fights like a healthy one.' },
  { key: 'rings', ai: 'HF_RINGS', title: 'Knows About Rings', step: '4.7', strength: false, moodLo: 1,
    tip: 'A bot sees the rings that some tanks carry around them. In a fight it keeps outside a ring of its target that hurts it, when its guns reach that far. On its way it walks out of a ring that hurts it and does not farm inside one, and when it runs away it avoids such rings. A hurt bot walks into a ring of its own side that heals it and stays there until it is healthy again. One bot in seven does not mind rings. Off: no bot knows a ring is there.' },
  { key: 'meet', ai: 'HF_MEETDIST', title: 'Fights From Where It Is', step: '4.5', strength: false, moodLo: 1,
    tip: 'A bot that meets a tank farther off than the distance it likes fights it from there, as players do, and does not walk in first. Never from more than 1.7 times the distance it likes, and a bot that likes to fight close still goes in close. It still walks in when its shots do nothing for a while, and when a wall comes between them. Off: every bot first walks in to its own distance.' },
  { key: 'nest', ai: 'HF_NEST', title: 'Trappers Camp', step: '8.3', strength: false, moodLo: 1,
    tip: 'A bot on a tank that lays traps sometimes camps, as many players on such tanks do. It holds its ground for half a minute or more and keeps laying traps around it, with or without a tank in sight. A camp starts in a fight, or at food it already stands close enough to farm. Small food like a square is shot in passing and starts no camp. When its shots take nothing off its food for a few seconds, the camp ends and the bot walks closer, and if still nothing lands it leaves that food. The bot gives way when a tank comes too close and runs when it is badly hurt. It camps only where its traps have room, never in a narrow corridor where most of them would land in the walls beside it. With nothing to aim at it turns so that none of its guns points at a wall right beside it. Between two camps it moves like any other bot. Only for a bot alone in a free for all.' },
  { key: 'dronehand', ai: 'HF_DRONEHAND', title: 'Drones Go Round Walls', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a drone tank leads its drones with one pointer, as a player does. It gathers them into a group and walks the group through the corridors, round the walls, to the tank or the food it has decided to fight, while it stays back itself. It only does so when the whole way lies on its own screen. With a clear view it sends them straight at the target. Its pointer never leaves its own screen.' },
  { key: 'dronedist', ai: 'HF_DRONEDIST', title: 'Drone Tanks Stay Back', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a drone tank or a minion tank fights a tank from far away and lets its drones or minions do the work. It keeps that tank near the far end of its own screen, never at the very edge, and backs off to there when the tank is nearer. When the tank is farther it stays where it is and never walks in, even when it is the stronger one. The Distance From Target of its category is the nearest it stands.' },
  { key: 'droneback', ai: 'HF_DRONEBACK', title: 'Drones Come Back Or Crash', step: '8.2', strength: false, moodLo: 1,
    tip: 'When its fight is over and its drones are far off behind a wall, a bot on a drone tank walks them home through the corridors if that is quicker than making new ones. If not, it flies them into the nearest wall so new ones are born beside it. When a tank that is not its target comes too near, shoots at it or hits it, it calls its drones home the quickest way at once, holds them by its body, and walks to meet them when that way is safe.' },
  { key: 'dronekeep', ai: 'HF_DRONEKEEP', title: 'Drones Kept Off Walls', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a drone tank or a minion tank keeps them alive on its way. On a map with walls its pointer stays held while it has no fight. Its drones and its minions stay by its own body while it moves, not in front of it. It turns the pointer round its minions so they close up and do not drift into a wall. It keeps its body away from a wall when it can and does not point its drone guns at a wall close by, so new ones are not born into the wall. On a map with no walls they rest around it and hunt by themselves as before.' },
  { key: 'dronesafe', ai: 'HF_DRONESAFE', title: 'Drone Tanks Take Cover', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a drone tank or a minion tank asks if the tank it fights can hit it. If so it goes behind the nearest wall from which its drones or minions still have a way on its screen, and fights from there. It paces instead of standing still, steps away from a tank that is a danger to it, and from behind a wall it sends them in groups. A round it cannot step away from is met by its drones, moved by its one pointer as a hand moves a mouse. When its drones or minions are away and a tank comes straight at it, it steps away from that tank and calls them home, whether that tank has fired at it or not.' },
  { key: 'override', ai: 'HF_OVERRIDE', title: 'Drones Spare Friends', step: '8.2', strength: false, moodLo: 1,
    tip: 'In a free for all, a bot whose drones, minions or swarm hunt by themselves holds override while a tank it is at peace with stands near it, as a player presses R. Its rounds then stop hunting by themselves until that tank has gone.' },
  { key: 'swarmhand', ai: 'HF_SWARMHAND', title: 'Swarm Tanks Keep Shooting', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a swarm tank keeps shooting on its way, its pointer held right at its own front, so its rounds circle its body like a shield and do not fly ahead of it. Between walls it shoots only while its rounds have room to fly, so they do not die on walls. It shoots at a tank behind a wall only when its rounds, which fly in a curve, can reach that tank round the corner. Then it stands and shoots. Tanks whose drones or minions die after a while count as swarm tanks.' },
  { key: 'minionhand', ai: 'HF_MINIONHAND', title: 'Minions Go Round Walls', step: '8.2', strength: false, moodLo: 1,
    tip: 'A bot on a minion tank leads its minions with one pointer. Minions circle the pointer, so it aims past the place they shall go and they run there as one group, round the walls. Between walls it aims past the tank it fights so they ram it. On open ground they circle that tank and shoot as before. Its pointer never leaves its own screen.' },
  { key: 'travel', ai: 'HF_TRAVEL', title: 'Tanks Go To Their Place', step: '4.4', strength: false, moodLo: 1,
    tip: 'A bot on its way to the kind of place its tank likes leaves other tanks alone and chases nobody. If it is hit on the way it shoots back while it keeps going to its place, unless the way leads toward the tank that hits it. Once there it fights as always. One bold bot in a dozen still starts fights on the way. On a maze map Likes Its Own Ground does this by itself, so this matters for a bot the three areas do not rule and on maps with no maze.' },
  { key: 'ram', ai: 'HF_RAM', title: 'Rammers Pick Their Fights', step: '8.1b', strength: false, moodLo: 1,
    tip: 'A tank of the Rammer Tanks group works out who would win a ram from both tanks as they are right now: health, shield, body damage, how well each takes a hit and how fast each mends, and what that tank\'s guns would do to it on the way in and during the ram. It also asks if it can get to that tank soon: a gun tank that sees it and backs off nearly as fast as it drives is not charged head on. If it would win and can get there it attacks, goes straight at its target, at the place a moving target will be within the next second, also when the target stands at a wall, and never turns back. It gives up only when it has taken twice what it dealt and its health is low. A tank it cannot beat yet but could beat hurt, or cannot get to in time, is its prey: it keeps that tank near the edge of its screen, outside the distance that tank can shoot, and strikes when the prey is losing a fight, is under 60 percent of its health or runs from someone. Every other tank it leaves alone and walks away from. Other tanks treat a rammer that drives straight at them as a threat: they shoot at it and back off, also when they were at peace with it. A rammer that only passes nearby does not count. Off: rammers judge and fight as before.' },
];
export const FEEL = {
  SIGHT: 0, KEYS: 1, HAND: 2, LOOK: 3, SWING: 4, BOOST: 5, TRUST: 6, CROWD: 7, SPIN: 8, SWEEP: 9, AIM: 10, STOPS: 11, TOGETHER: 12, LINES: 13, ODDS: 14, MATES: 15, PROTECT: 16, LETGO: 17, CALM: 18, SMASH: 19, WAG: 20, JOIN: 21, FOCUS: 22, GOALS: 23, SPAWN: 24, OWNTIME: 25, FINGER: 26, CURSOR: 27, READY: 28, SEES: 29, ONEFOE: 30, MIND: 31, GAP: 32, RISK: 33, EARLY: 34, PLACE: 35, QUIET: 36, DODGE: 37, KEEPHID: 38, HURTAWAY: 39, RINGS: 40, MEET: 41, NEST: 42, DRONEHAND: 43, DRONEDIST: 44, DRONEBACK: 45, DRONEKEEP: 46, DRONESAFE: 47, OVERRIDE: 48, SWARMHAND: 49, MINIONHAND: 50, TRAVEL: 51, RAM: 52,
} as const;
export const HF_HOOK: { keeps: ((v: EnemyTank, t: EnemyTank) => boolean) | null } = { keeps: null };
export const FEEL_COUNT = FEEL_ROWS.length;

export interface BotFeelEntry { on?: boolean; strength?: number }
export interface BotFeelConfig { mood?: boolean; rows?: Record<string, BotFeelEntry> }

export function clampBotFeel(v: unknown): BotFeelConfig | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const src = v as { mood?: unknown; rows?: unknown };
  const out: BotFeelConfig = {};
  if (src.mood === false) out.mood = false;
  if (src.rows && typeof src.rows === 'object') {
    const rows: Record<string, BotFeelEntry> = {};
    let any = false;
    for (const r of FEEL_ROWS) {
      const e = (src.rows as Record<string, unknown>)[r.key];
      if (!e || typeof e !== 'object') continue;
      const o = e as { on?: unknown; strength?: unknown };
      const w: BotFeelEntry = {};
      if (o.on === false) w.on = false;
      if (r.strength && typeof o.strength === 'number' && Number.isFinite(o.strength)) { const s = Math.round(Math.max(0, Math.min(100, o.strength))); if (s !== 100) w.strength = s; }
      if (w.on !== undefined || w.strength !== undefined) { rows[r.key] = w; any = true; }
    }
    if (any) out.rows = rows;
  }
  return out.mood !== undefined || out.rows ? out : undefined;
}

const MOOD_MIN_MS = 3 * 60 * 1000, MOOD_MAX_MS = 15 * 60 * 1000;
function moodRoll(u: number, v: number, lo: number): number {
  const span = 1 - lo;
  if (u < 0.25) return lo + span * (0.75 + 0.25 * v);
  if (u < 0.75) return lo + span * (0.3 + 0.45 * v);
  return lo + span * (0.3 * v);
}
export class FeelFrame {
  readonly s: Float32Array;
  readonly base: Float32Array;
  readonly mood: Float32Array;
  moodNextAt: number;
  moodRolls: number;
  private _cfg: unknown;
  private _moodOn: boolean;
  private _seed: number;
  private readonly _on: Uint8Array;
  private readonly _str: Float32Array;
  constructor() {
    const n = FEEL_ROWS.length;
    this.s = new Float32Array(n); this.base = new Float32Array(n); this.mood = new Float32Array(n).fill(1);
    this.moodNextAt = 0; this.moodRolls = 0;
    this._cfg = null; this._moodOn = true; this._seed = 1;
    this._on = new Uint8Array(n).fill(1); this._str = new Float32Array(n).fill(1);
  }
  matchStart(matchSerial: number, mapSeed: number): void {
    this._seed = hfSeedOf(((matchSerial * 0.6180339887) % 1), ((Math.abs(mapSeed) * 0.7548776662) % 1), 0.5, 0.25, 0.125);
    this.moodNextAt = 0; this.moodRolls = 0;
    this.mood.fill(1);
  }
  sync(botFeel: BotFeelConfig | undefined, nowMs: number, entropy: number): void {
    const rows = FEEL_ROWS, n = rows.length;
    if (botFeel !== this._cfg) {
      this._cfg = botFeel;
      this._moodOn = !botFeel || botFeel.mood !== false;
      for (let i = 0; i < n; i++) {
        const e = botFeel && botFeel.rows ? botFeel.rows[rows[i].key] : undefined;
        this._on[i] = e && e.on === false ? 0 : 1;
        this._str[i] = e && e.strength !== undefined && rows[i].strength ? e.strength / 100 : 1;
      }
    }
    const moodOn = FEEL_LIVE && this._moodOn && AI_CONSTANTS.HF_MOOD !== 0;
    if (moodOn && nowMs >= this.moodNextAt) {
      if (this.moodRolls === 0) this._seed = (this._seed ^ entropy) || 1;
      const k = this.moodRolls++;
      for (let i = 0; i < n; i++) this.mood[i] = rows[i].moodLo >= 1 ? 1 : moodRoll(hfHash(this._seed, 7001 + i, k), hfHash(this._seed, 9001 + i, k), rows[i].moodLo);
      this.moodNextAt = nowMs + MOOD_MIN_MS + (MOOD_MAX_MS - MOOD_MIN_MS) * hfHash(this._seed, 5003, k);
    } else if (!moodOn && this.moodRolls !== 0) { this.mood.fill(1); this.moodRolls = 0; this.moodNextAt = 0; }
    const AC = AI_CONSTANTS as unknown as Record<string, number>;
    for (let i = 0; i < n; i++) {
      const b = FEEL_LIVE && AC[rows[i].ai] !== 0 && this._on[i] !== 0 ? this._str[i] : 0;
      this.base[i] = b;
      this.s[i] = b * this.mood[i];
    }
  }
}

export interface HfAreaFacts { cls: Uint8Array; f1: Uint16Array; f2: Uint16Array; f3: Uint16Array; q: Int32Array; corr: number; ok: boolean; hasC: boolean; ver: number }
export interface HfState {
  seed: number;
  dnaTrust: number; dnaGesture: number; dnaSpin: number; dnaStill: number; dnaHand: number;
  plays: boolean;
  legs: boolean;
  sightBox: boolean;
  sightSet: number; sightOld: number;
  keyIdx: number; keyAt: number;
  heldAngle: number; heldHas: boolean; heldFight: boolean; lookId: string; reactUntil: number; noFireUntil: number; bandK: number;
  lookMode: number; lookUntil: number; lookOff: number; lookX: number; lookY: number; pathAngle: number;
  boostK: number; boostPhi: number; boostCancel: number; boostSniper: boolean; boostUntil: number; boostNextAt: number; trigger: boolean;
  boostOk: boolean;
  boostCan: boolean;
  wsF: boolean; wsB: boolean;
  afHold: boolean; afNext: number;
  standAt: number;
  idn: number;
  trId: string[]; trSt: Int8Array; trAt: Float64Array; trBase: Float64Array; trRoll: Float64Array; trFull: boolean;
  fightN: number; autos: number; chaseLast: number;
  tanAt: number; tanX: number; tanY: number; tanInX: number; tanInY: number;
  leanAt: number; leanX: number; leanY: number;
  cover: number; bpsMax: number;
  placeKind: number; placeP: number;
  cpAng: number; cpHold: boolean; cpAt: number;
  spinUntil: number; spinNextAt: number; spinDir: number; spinAngle: number; spinRate: number; spinWas: boolean;
  sweepUntil: number; sweepNextAt: number; sweepOff: number;
  leadK: number;
  stopUntil: number; stopNextAt: number;
  helpMate: number; helpAt: number;
  tmHas: boolean; tmNext: number; tmMates: number; tmFoes: number; tmNId: string; tmNd: number; tmPId: string; tmPd: number;
  goId: string; goUntil: number; goNextAt: number;
  chaseMs: number; chaseAskMs: number; chaseOffMs: number; letId: number; letUntil: number;
  letAt: number; rkGaveN: number; rkGaveAt: number;
  cwN: number; cwUntil: number;
  rmOn: boolean; rmMode: number; rmN: number; rmId: string; rmAt: number; rmUntil: number; rmSeenAt: number;
  rmTaken: number; rmDealt: number; rmMyLast: number; rmItsLast: number; rmNoFear: boolean;
  rmRolls: number; rmGo: boolean; rmGoAt: number; rmWAt: number; rmWHp: number; rmWFoeHp: number; rmWFoe: string;
  rcNext: number; rcN: number; rcId: string; rcUntil: number; rcX: number; rcY: number; rcLooks: number;
  rmLeftN: number; rmLeftUntil: number; rmOnAt: number; rmGdAt: number; rmGdN: number; rmVN: number[]; rmVV: number[]; rmVUntil: number[]; rmVFrame: number; rmVCnt: number;
  peaceAt: number; lives: number;
  letStr: string; letTurnUntil: number;
  wagUntil: number; wagBase: number; wagSeen: number; wagNextAt: number; wgNext: number; wgStep: number; wgAt: number;
  moveHoldUntil: number; paceT: number; lookAbs: number; lookPath0: number; lookSoon: boolean; tlAng: number; tlUntil: number; tlB0: number; fixAt: number; strokeWant: number;
  lostId: string;
  trAsk: Float64Array; wagTo: number; wagAt: number;
  focN: number; focUntil: number; focDmg: number; focHurtAt: number; focLock: number; focOn: boolean; focFree: number; focId: string; focSeenAt: number;
  roamSince: number; roamLast: number; glId: string; glUntil: number; glNextAt: number; ntNext: number; glOk: boolean;
  glLastId: string; glLastUntil: number;
  gzX: number; gzY: number; gzUntil: number; spNext: number; spWait: boolean; selfO: boolean;
  wX: number; wY: number; wM: number; wAt: number; tanSide: number; tanSideAt: number;
  sX: number; sY: number; revAt: number; cuTremAt: number;
  cuHas: boolean; cuX: number; cuY: number; cuFX: number; cuFY: number; cuTX: number; cuTY: number; cuT0: number; cuT1: number; cuBend: number;
  cuGX: number; cuGY: number; cuFixAt: number; cuRho: number; cuLook: number;
  geTurnsUntil: number; geDir: number; gePhase: number; geNextAt: number; geOff: number; geSide: number;
  eyeUntil: number; eyeNext: number; eyeAsk: number;
  rgDir: number; rgAt: number; rgSeen: number;
  cvX: number; cvY: number; cvNext: number; cvOk: number;
  h1Id: string; h1At: number; h2Id: string; h2At: number;
  cvGX: number; cvGY: number;
  dgId: number; dgGo: boolean; dgHard: boolean; dgAsk: number; avId: number; avGo: boolean;
  cnId: string; cnUntil: number; cnSince: number; cnPause: number; cnGo: boolean; cnOut: boolean; cnOutX: number; cnOutY: number;
  bkAskId: string; bkAt: number; bkOk: boolean; bkUntil: number;
  dgX: number; dgY: number; dgUntil: number;
  hsId: string; hsX: number; hsY: number; hsLost: number; hsFor: number;
  hwX: number; hwY: number; hwUntil: number; hwAt: number;
  rnNext: number; rnX: number; rnY: number; rnR: number; rnUntil: number; rhX: number; rhY: number; rhR: number; rhUntil: number; rhAt: number;
  fdN: number; fdD: number; fdAt: number;
  tsUntil: number; tsNextAt: number;
  gfV: number; gfAt: number;
  rpV: number; rpAt: number;
  cbId: string; cbAt: number; cbSeen: number;
  wmC: Int32Array; wmT: Float64Array; wmH: number; wmN: number; wmArea: string;
  rfV: number; rlV: number; rbV: number; hvR: number; hrSince: number; hrAt: number;
  hqId: string; hqR: number; hqAt: number;
  gAt: number; gLd: string; gN: number; gCall: number; gCallAt: number; gSeen: number; gFx: number; gFy: number; gFoe: number; gOwn: number; gMem: number; gMemAt: number; gPat: number; gGoUntil: number; gBackAt: number; gRx: number; gRy: number; gKey: string;
  gDo: number; gPend: number; gDoAt: number; gTx: number; gTy: number; gTk: string; gQx: number; gQy: number; gKite: number; gThere: boolean;
  gB: number; gBAt: number;
  udNext: number; udUntil: number; udX: number; udY: number; udSum: number; udSince: number; udAt: number;
  ckN: number; ckSince: number; ckSeen: number;
  hitId: string; hitX: number; hitY: number; hitUntil: number;
  hvMem: boolean; hmUntil: number;
  hvC: number;
  wfV: number;
  hvId: string; hvX: number; hvY: number; hvK: number;
  hkX: number; hkY: number; hkUntil: number; hkSince: number; hkQuitId: string; hkQuitUntil: number;
  fcId: string; fcSince: number; fcAt: number;
  dKind: number; dMax: number; dwMode: number; dwX: number; dwY: number; dwGX: number; dwGY: number; dwVX: number; dwVY: number; dwCX: number; dwCY: number; dwPress: boolean; dwHold: boolean; dwReach: boolean;
  dwAt: number; dwTick: number; dwSince: number; dwReachAt: number; dwT: string; ddHoldAt: number;
  dFrame: number; dN: number; dAll: number; dRad: number; dX: Float32Array; dY: Float32Array;
  dSpd: number; dOrb: number; dBps: number; sLed: boolean; thAt: number; foeId: string;
  dnX: number; dnY: number; dnUntil: number; dbKey: string; dbGoX: number; dbGoY: number; dbGoUntil: number; dbOffUntil: number;
  dkAt: number; dkIn: boolean; dkUntil: number; dmHoldAt: number;
  dcNext: number; dcOk: number; dcGX: number; dcGY: number; dcX: number; dcY: number; dcGoUntil: number;
  ovAt: number; ovOn: boolean; ovX: number; ovY: number;
  swV0: number; swTop: number; swTurn: number; swRad: number; swLaw: number; swLife: number; swFrame: number; swAt: number; swCan: boolean; swFire: boolean;
  tvOn: boolean; tvR: number;
  esNext: number; esQX: number; esQY: number; esSpin: boolean; esPh: number; esAt: number;
  esD: number;
  pcNext: number; pcOk: boolean; pcX: number; pcY: number; pcLX: number; pcLY: number;
  awNext: number; awOk: boolean; awX: number; awY: number; nwAt: number; spN: number; spA0: number; spA1: number; spA2: number; spA3: number;
  arRank: number; arPend: number; arPendAt: number; arNext: number; arG: number; arM: number; arL: number; arOk: boolean; arTX: number; arTY: number; arDX: number; arDY: number; arTUntil: number; arBul: number; arSide: boolean;
  adX: number; adY: number; adUntil: number; adNext: number; ahX: number; ahY: number; ahR2: number; ahUntil: number; ahId: string; ahN: number; dtSide: number; dtAt: number; arRest: number; lvId: string; lvX: number; lvY: number; lvR: number; lvUntil: number; lvTurnAt: number; lvBlk: number; lvFh: number; frN: number; frC: Float64Array; frId: string[]; flAt: number; flX: number; flY: number; cdAt: number; cdOn: boolean; slId: string; slFirst: number; slAt: number; slN: number; slPool: number;
  evN: number;
  arLs: number; arLsAt: number;
  owNext: number; owX: number; owY: number; owK: number;
  esL: number;
  foeD2: number; foeX: number; foeY: number; foeNext: number; fightAt: number; trDone: Float64Array; trHitAt: Float64Array; hbId: string[]; hbAt: Float64Array;
  foeSee: boolean; foeHot: boolean; hidWas: boolean; seeAt: number;
  rvId: string; rvN: number; rvSince: number; rvLast: number; rvHits: number; rvStamp: number; cfCoverAt: number;
  cfIdx: number; cfNext: number; cfAt: number;
  frHold: boolean; frAside: boolean; frAsideAt: number; frNext: number; frSince: number; frSide: number; frSX: number; frSY: number; frFree: number; focRhino: boolean;
  tgR: number;
  tgD: number; tgWeak: boolean; tgAt: number; fdId: string; fdHp: number; fdMiss: number; fdTick: number;
  foodAt: number; lookPrev: string; lookPrevAt: number;
  rkN: Int32Array; rkUntil: Float64Array; rkV: Uint8Array;
}
export const HF_TR_SLOTS = 8;
function HfShell(this: HfState): void {
  this.seed = 1;
  this.dnaTrust = 0.5; this.dnaGesture = 0.5; this.dnaSpin = 0.5; this.dnaStill = 0.5; this.dnaHand = 0.5;
  this.plays = false; this.legs = false;
  this.sightBox = false; this.sightSet = 0; this.sightOld = 0;
  this.keyIdx = -1; this.keyAt = 0;
  this.heldAngle = 0; this.heldHas = false; this.heldFight = false; this.lookId = ''; this.reactUntil = 0; this.noFireUntil = 0; this.bandK = 0.035;
  this.lookMode = 0; this.lookUntil = 0; this.lookOff = 0; this.lookX = 0; this.lookY = 0; this.pathAngle = 0;
  this.boostK = 0; this.boostPhi = 0; this.boostCancel = 1; this.boostSniper = false; this.boostUntil = 0; this.boostNextAt = 0; this.trigger = false;
  this.boostOk = false; this.boostCan = false; this.wsF = false; this.wsB = false; this.afHold = false; this.afNext = 0; this.standAt = 0;
  this.idn = 0;
  this.trId = ['', '', '', '', '', '', '', '']; this.trSt = new Int8Array(HF_TR_SLOTS); this.trAt = new Float64Array(HF_TR_SLOTS); this.trBase = new Float64Array(HF_TR_SLOTS); this.trRoll = new Float64Array(HF_TR_SLOTS); this.trFull = false;
  this.fightN = 0; this.autos = 0; this.chaseLast = 0;
  this.tanAt = -1; this.tanX = 0; this.tanY = 0; this.tanInX = 0; this.tanInY = 0;
  this.leanAt = -1; this.leanX = 0; this.leanY = 0;
  this.cover = 1; this.bpsMax = 0; this.placeKind = 0; this.placeP = 0; this.cpAng = 0; this.cpHold = false; this.cpAt = 0;
  this.spinUntil = 0; this.spinNextAt = 0; this.spinDir = 1; this.spinAngle = 0; this.spinRate = 0; this.spinWas = false;
  this.sweepUntil = 0; this.sweepNextAt = 0; this.sweepOff = 0;
  this.leadK = 1;
  this.stopUntil = 0; this.stopNextAt = 0;
  this.helpMate = 0; this.helpAt = 0;
  this.tmHas = false; this.tmNext = 0; this.tmMates = 0; this.tmFoes = 0; this.tmNId = ''; this.tmNd = 0; this.tmPId = ''; this.tmPd = 0;
  this.goId = ''; this.goUntil = 0; this.goNextAt = 0;
  this.chaseMs = 0; this.chaseAskMs = 0; this.chaseOffMs = 0; this.letId = 0; this.letUntil = 0;
  this.letAt = 0; this.rkGaveN = 0; this.rkGaveAt = 0;
  this.cwN = 0; this.cwUntil = 0;
  this.rmOn = false; this.rmMode = 0; this.rmN = 0; this.rmId = ''; this.rmAt = 0; this.rmUntil = 0; this.rmSeenAt = 0;
  this.rmTaken = 0; this.rmDealt = 0; this.rmMyLast = 0; this.rmItsLast = 0; this.rmNoFear = false;
  this.rmRolls = 0; this.rmGo = false; this.rmGoAt = 0; this.rmWAt = 0; this.rmWHp = 0; this.rmWFoeHp = 0; this.rmWFoe = '';
  this.rcNext = 0; this.rcN = 0; this.rcId = ''; this.rcUntil = 0; this.rcX = 0; this.rcY = 0; this.rcLooks = 0;
  this.rmLeftN = 0; this.rmLeftUntil = 0; this.rmOnAt = 0; this.rmGdAt = 0; this.rmGdN = 0; this.rmVN = [0, 0, 0, 0, 0, 0]; this.rmVV = [0, 0, 0, 0, 0, 0]; this.rmVUntil = [0, 0, 0, 0, 0, 0]; this.rmVFrame = -1; this.rmVCnt = 0;
  this.peaceAt = 0; this.lives = 0;
  this.letStr = ''; this.letTurnUntil = 0;
  this.wagUntil = 0; this.wagBase = 0; this.wagSeen = 0; this.wagNextAt = 0; this.wgNext = 0; this.wgStep = 0; this.wgAt = 0;
  this.moveHoldUntil = 0; this.paceT = 0; this.lookAbs = 0; this.lookPath0 = 0; this.lookSoon = false; this.tlAng = 0; this.tlUntil = 0; this.tlB0 = 0; this.fixAt = 0; this.strokeWant = 0;
  this.lostId = '';
  this.trAsk = new Float64Array(HF_TR_SLOTS); this.wagTo = 0; this.wagAt = 0;
  this.focN = 0; this.focUntil = 0; this.focDmg = 0; this.focHurtAt = 0; this.focLock = 0; this.focOn = false; this.focFree = 0; this.focId = ''; this.focSeenAt = 0;
  this.roamSince = 0; this.roamLast = 0; this.glId = ''; this.glUntil = 0; this.glNextAt = 0; this.ntNext = 0; this.glOk = false;
  this.glLastId = ''; this.glLastUntil = 0;
  this.gzX = 0; this.gzY = 0; this.gzUntil = 0; this.spNext = 0; this.spWait = false; this.selfO = false;
  this.wX = 0; this.wY = 0; this.wM = 0; this.wAt = 0; this.tanSide = 0; this.tanSideAt = 0; this.sX = 0; this.sY = 0; this.revAt = 0; this.cuTremAt = 0;
  this.cuHas = false; this.cuX = 0; this.cuY = 0; this.cuFX = 0; this.cuFY = 0; this.cuTX = 0; this.cuTY = 0; this.cuT0 = 0; this.cuT1 = 0; this.cuBend = 0;
  this.cuGX = 0; this.cuGY = 0; this.cuFixAt = 0; this.cuRho = 0; this.cuLook = 0;
  this.geTurnsUntil = 0; this.geDir = 1; this.gePhase = 0; this.geNextAt = 0; this.geOff = 0; this.geSide = 1;
  this.eyeUntil = 0; this.eyeNext = 0; this.eyeAsk = 0;
  this.rgDir = 0; this.rgAt = 0; this.rgSeen = 0;
  this.cvX = 0; this.cvY = 0; this.cvNext = 0; this.cvOk = 0;
  this.h1Id = ''; this.h1At = 0; this.h2Id = ''; this.h2At = 0;
  this.cvGX = -1; this.cvGY = -1;
  this.dgId = 0; this.dgGo = false; this.dgHard = false; this.dgAsk = 0; this.avId = 0; this.avGo = false;
  this.cnId = ''; this.cnUntil = 0; this.cnSince = 0; this.cnPause = 0; this.cnGo = false; this.cnOut = false; this.cnOutX = 0; this.cnOutY = 0;
  this.bkAskId = ''; this.bkAt = 0; this.bkOk = false; this.bkUntil = 0;
  this.dgX = 0; this.dgY = 0; this.dgUntil = 0;
  this.hsId = ''; this.hsX = 0; this.hsY = 0; this.hsLost = 0; this.hsFor = 0;
  this.hwX = 0; this.hwY = 0; this.hwUntil = 0; this.hwAt = 0;
  this.rnNext = 0; this.rnX = 0; this.rnY = 0; this.rnR = 0; this.rnUntil = 0; this.rhX = 0; this.rhY = 0; this.rhR = 0; this.rhUntil = 0; this.rhAt = 0;
  this.fdN = 0; this.fdD = 0; this.fdAt = 0;
  this.tsUntil = 0; this.tsNextAt = 0;
  this.gfV = 0; this.gfAt = 0;
  this.rpV = 0; this.rpAt = 0;
  this.cbId = ''; this.cbAt = 0; this.cbSeen = 0;
  this.wmC = new Int32Array(24).fill(-1); this.wmT = new Float64Array(24); this.wmH = 0; this.wmN = 0; this.wmArea = '';
  this.rfV = 0; this.rlV = 0; this.rbV = 0; this.hvR = 0; this.hrSince = 0; this.hrAt = 0;
  this.hqId = ''; this.hqR = 0; this.hqAt = 0; this.hvMem = false; this.hmUntil = 0; this.hvC = 0; this.wfV = 0;
  this.hitId = ''; this.hitX = 0; this.hitY = 0; this.hitUntil = 0;
  this.gAt = 0; this.gLd = ''; this.gN = 1; this.gCall = 0; this.gCallAt = 0; this.gSeen = 0; this.gFx = 0; this.gFy = 0; this.gFoe = 0; this.gOwn = 0; this.gMem = 0; this.gMemAt = 0; this.gPat = 0; this.gGoUntil = 0; this.gBackAt = 0; this.gRx = 0; this.gRy = 0; this.gKey = '';
  this.gDo = 0; this.gPend = 0; this.gDoAt = 0; this.gTx = 0; this.gTy = 0; this.gTk = ''; this.gQx = 0; this.gQy = 0; this.gKite = 0; this.gThere = false;
  this.gB = 0; this.gBAt = 0;
  this.ckN = 0; this.ckSince = 0; this.ckSeen = 0;
  this.udNext = 0; this.udUntil = 0; this.udX = 0; this.udY = 0; this.udSum = 0; this.udSince = 0; this.udAt = 0;
  this.hvId = ''; this.hvX = 0; this.hvY = 0; this.hvK = 0;
  this.hkX = 0; this.hkY = 0; this.hkUntil = 0; this.hkSince = 0; this.hkQuitId = ''; this.hkQuitUntil = 0;
  this.fcId = ''; this.fcSince = 0; this.fcAt = 0;
  this.dKind = 0; this.dMax = 0; this.dwMode = 0; this.dwX = 0; this.dwY = 0; this.dwGX = 0; this.dwGY = 0; this.dwVX = 0; this.dwVY = 0; this.dwCX = 0; this.dwCY = 0; this.dwPress = false; this.dwHold = false; this.dwReach = false;
  this.dwAt = 0; this.dwTick = 0; this.dwSince = 0; this.dwReachAt = 0; this.dwT = ''; this.ddHoldAt = -1;
  this.dFrame = -9; this.dN = 0; this.dAll = 0; this.dRad = 0; this.dX = new Float32Array(16); this.dY = new Float32Array(16);
  this.dSpd = 0; this.dOrb = 0; this.dBps = 0; this.sLed = false; this.thAt = -1e9; this.foeId = '';
  this.dnX = 0; this.dnY = 0; this.dnUntil = 0; this.dbKey = ''; this.dbGoX = 0; this.dbGoY = 0; this.dbGoUntil = 0; this.dbOffUntil = 0;
  this.dkAt = 0; this.dkIn = false; this.dkUntil = 0; this.dmHoldAt = 0;
  this.dcNext = 0; this.dcOk = 0; this.dcGX = -1; this.dcGY = -1; this.dcX = 0; this.dcY = 0; this.dcGoUntil = 0;
  this.ovAt = 0; this.ovOn = false; this.ovX = 0; this.ovY = 0;
  this.swV0 = 0; this.swTop = 0; this.swTurn = 5; this.swRad = 0; this.swLaw = 0; this.swLife = 0; this.swFrame = -9; this.swAt = 0; this.swCan = false; this.swFire = false;
  this.tvOn = false; this.tvR = -1;
  this.esNext = 0; this.esQX = 0; this.esQY = 0; this.esSpin = false; this.esPh = 0; this.esAt = 0;
  this.esD = 12;
  this.pcNext = 0; this.pcOk = false; this.pcX = 0; this.pcY = 0; this.pcLX = -1; this.pcLY = -1;
  this.awNext = 0; this.awOk = false; this.awX = 0; this.awY = 0; this.nwAt = 0; this.spN = 0; this.spA0 = 0; this.spA1 = 0; this.spA2 = 0; this.spA3 = 0;
  this.arRank = 0; this.arPend = 0; this.arPendAt = 0; this.arNext = 0; this.arG = 0; this.arM = 0; this.arL = 0; this.arOk = false; this.arTX = 0; this.arTY = 0; this.arDX = 0; this.arDY = 0; this.arTUntil = 0; this.arBul = 0; this.arSide = false;
  this.adX = 0; this.adY = 0; this.adUntil = 0; this.adNext = 0; this.ahX = 0; this.ahY = 0; this.ahR2 = 0; this.ahUntil = 0; this.ahId = ''; this.ahN = 0; this.dtSide = 0; this.dtAt = 0; this.arRest = 0; this.lvId = ''; this.lvX = 0; this.lvY = 0; this.lvR = 0; this.lvUntil = 0; this.lvTurnAt = 0; this.lvBlk = 0; this.lvFh = 0; this.frN = 0; this.frC = new Float64Array(12); this.frId = ['', '', '', '']; this.flAt = 0; this.flX = 0; this.flY = 0; this.cdAt = 0; this.cdOn = false; this.slId = ''; this.slFirst = 0; this.slAt = 0; this.slN = 0; this.slPool = 0;
  this.evN = 0;
  this.arLs = 0; this.arLsAt = 0;
  this.owNext = 0; this.owX = 0; this.owY = 0; this.owK = 0;
  this.esL = 0;
  this.foeD2 = Infinity; this.foeX = 0; this.foeY = 0; this.foeNext = 0; this.fightAt = 0; this.trDone = new Float64Array(HF_TR_SLOTS); this.trHitAt = new Float64Array(HF_TR_SLOTS); this.hbId = ['', '', '', '']; this.hbAt = new Float64Array(4);
  this.foeSee = false; this.foeHot = false; this.hidWas = false; this.seeAt = 0;
  this.rvId = ''; this.rvN = 0; this.rvSince = 0; this.rvLast = 0; this.rvHits = 0; this.rvStamp = 0; this.cfCoverAt = 0; this.cfIdx = -1; this.cfNext = 0; this.cfAt = 0;
  this.frHold = false; this.frAside = false; this.frAsideAt = 0; this.frNext = 0; this.frSince = 0; this.frSide = 0; this.frSX = 0; this.frSY = 0; this.frFree = 0; this.focRhino = false; this.tgR = 0; this.tgD = 0; this.tgWeak = false; this.tgAt = 0; this.fdId = ''; this.fdHp = 0; this.fdMiss = 0; this.fdTick = 0; this.foodAt = 0; this.lookPrev = ''; this.lookPrevAt = 0;
  this.rkN = new Int32Array(4); this.rkUntil = new Float64Array(4); this.rkV = new Uint8Array(4);
}
export function newHfState(): HfState { return new (HfShell as unknown as { new (): HfState })(); }
export function hfReset(h: HfState, g1: number, g2: number, g3: number, g4: number, g5: number): void {
  const seed = hfSeedOf(g1, g2, g3, g4, g5);
  h.seed = seed;
  if (FEEL_LIVE && AI_CONSTANTS.HF_GENES !== 0) {
    h.dnaTrust = hfHash(seed, 101, 0); h.dnaGesture = hfHash(seed, 102, 0); h.dnaSpin = hfHash(seed, 103, 0);
    h.dnaStill = hfHash(seed, 104, 0); h.dnaHand = hfHash(seed, 105, 0);
  } else { h.dnaTrust = 0.5; h.dnaGesture = 0.5; h.dnaSpin = 0.5; h.dnaStill = 0.5; h.dnaHand = 0.5; }
  h.plays = false; h.legs = false;
  h.sightBox = false; h.sightSet = 0; h.sightOld = 0;
  h.keyIdx = -1; h.keyAt = 0;
  h.heldAngle = 0; h.heldHas = false; h.heldFight = false; h.lookId = ''; h.reactUntil = 0; h.noFireUntil = 0;
  h.bandK = (1.2 + 2.3 * hfHash(seed, 48, 0)) * (Math.PI / 180);
  h.lookMode = 0; h.lookUntil = 0; h.lookOff = 0; h.lookX = 0; h.lookY = 0; h.pathAngle = 0;
  h.boostUntil = 0; h.boostNextAt = 0; h.trigger = false;
  h.boostOk = false; h.wsF = false; h.wsB = false; h.afHold = false; h.afNext = 0; h.standAt = 0;
  for (let i = 0; i < HF_TR_SLOTS; i++) { h.trId[i] = ''; h.trSt[i] = 0; h.trAt[i] = 0; h.trBase[i] = 0; h.trRoll[i] = 0; }
  h.fightN = 0; h.chaseLast = 0;
  h.tanAt = -1; h.tanX = 0; h.tanY = 0; h.tanInX = 0; h.tanInY = 0;
  h.leanAt = -1; h.leanX = 0; h.leanY = 0;
  h.trFull = false;
  h.spinUntil = 0; h.spinNextAt = 0; h.spinDir = 1; h.spinAngle = 0; h.spinRate = 0; h.spinWas = false;
  h.sweepUntil = 0; h.sweepNextAt = 0; h.sweepOff = 0;
  h.leadK = 0.15 + 0.6 * hfHash(seed, 49, 0);
  h.stopUntil = 0; h.stopNextAt = 0;
  h.helpMate = 0; h.helpAt = 0;
  h.tmHas = false; h.tmNext = 0; h.tmMates = 0; h.tmFoes = 0; h.tmNId = ''; h.tmNd = 0; h.tmPId = ''; h.tmPd = 0;
  h.goId = ''; h.goUntil = 0; h.goNextAt = 0;
  h.chaseMs = 0; h.chaseAskMs = 0; h.chaseOffMs = 0; h.letId = 0; h.letUntil = 0;
  h.letAt = 0; h.rkGaveN = 0; h.rkGaveAt = 0;
  h.cwN = 0; h.cwUntil = 0;
  h.rmOn = false; h.rmMode = 0; h.rmN = 0; h.rmId = ''; h.rmAt = 0; h.rmUntil = 0; h.rmSeenAt = 0;
  h.rmTaken = 0; h.rmDealt = 0; h.rmMyLast = 0; h.rmItsLast = 0; h.rmNoFear = false;
  h.rmRolls = 0; h.rmGo = false; h.rmGoAt = 0; h.rmWAt = 0; h.rmWHp = 0; h.rmWFoeHp = 0; h.rmWFoe = '';
  h.rcNext = 0; h.rcN = 0; h.rcId = ''; h.rcUntil = 0; h.rcX = 0; h.rcY = 0; h.rcLooks = 0;
  h.rmLeftN = 0; h.rmLeftUntil = 0; h.rmOnAt = 0; h.rmGdAt = 0; h.rmGdN = 0; for (let i = 0; i < 6; i++) { h.rmVN[i] = 0; h.rmVV[i] = 0; h.rmVUntil[i] = 0; } h.rmVFrame = -1; h.rmVCnt = 0;
  h.peaceAt = 0; h.lives = 0;
  h.letStr = ''; h.letTurnUntil = 0;
  h.wagUntil = 0; h.wagBase = 0; h.wagSeen = 0; h.wagNextAt = 0; h.wgNext = 0; h.wgStep = 0; h.wgAt = 0;
  h.moveHoldUntil = 0; h.paceT = 0; h.lookAbs = 0; h.lookPath0 = 0; h.lookSoon = false; h.tlAng = 0; h.tlUntil = 0; h.tlB0 = 0; h.fixAt = 0; h.strokeWant = 0;
  h.lostId = '';
  h.trAsk.fill(0); h.wagTo = 0; h.wagAt = 0;
  h.focN = 0; h.focUntil = 0; h.focDmg = 0; h.focHurtAt = 0; h.focLock = 0; h.focOn = false; h.focFree = 0; h.focId = ''; h.focSeenAt = 0;
  h.roamSince = 0; h.roamLast = 0; h.glId = ''; h.glUntil = 0; h.glNextAt = 0; h.ntNext = 0; h.glOk = false;
  h.glLastId = ''; h.glLastUntil = 0;
  h.gzX = 0; h.gzY = 0; h.gzUntil = 0; h.spNext = 0; h.spWait = false; h.selfO = false;
  h.wX = 0; h.wY = 0; h.wM = 0; h.wAt = 0; h.tanSide = 0; h.tanSideAt = 0; h.sX = 0; h.sY = 0; h.revAt = 0; h.cuTremAt = 0;
  h.cuHas = false; h.cuX = 0; h.cuY = 0; h.cuFX = 0; h.cuFY = 0; h.cuTX = 0; h.cuTY = 0; h.cuT0 = 0; h.cuT1 = 0; h.cuBend = 0;
  h.cuGX = 0; h.cuGY = 0; h.cuFixAt = 0; h.cuRho = 0; h.cuLook = 0;
  h.geTurnsUntil = 0; h.geDir = 1; h.gePhase = 0; h.geNextAt = 0; h.geOff = 0; h.geSide = 1;
  h.eyeUntil = 0; h.eyeNext = 0; h.eyeAsk = 0;
  h.rgDir = 0; h.rgAt = 0; h.rgSeen = 0;
  h.cvX = 0; h.cvY = 0; h.cvNext = 0; h.cvOk = 0;
  h.h1Id = ''; h.h1At = 0; h.h2Id = ''; h.h2At = 0;
  h.cvGX = -1; h.cvGY = -1;
  h.dgId = 0; h.dgGo = false; h.dgHard = false; h.dgAsk = 0; h.avId = 0; h.avGo = false;
  h.cnId = ''; h.cnUntil = 0; h.cnSince = 0; h.cnPause = 0; h.cnGo = false; h.cnOut = false; h.cnOutX = 0; h.cnOutY = 0;
  h.bkAskId = ''; h.bkAt = 0; h.bkOk = false; h.bkUntil = 0;
  h.dgX = 0; h.dgY = 0; h.dgUntil = 0;
  h.hsId = ''; h.hsX = 0; h.hsY = 0; h.hsLost = 0; h.hsFor = 0;
  h.hwX = 0; h.hwY = 0; h.hwUntil = 0; h.hwAt = 0;
  h.rnNext = 0; h.rnX = 0; h.rnY = 0; h.rnR = 0; h.rnUntil = 0; h.rhX = 0; h.rhY = 0; h.rhR = 0; h.rhUntil = 0; h.rhAt = 0;
  h.fdN = 0; h.fdD = 0; h.fdAt = 0;
  h.tsUntil = 0; h.tsNextAt = 0;
  h.dwMode = 0; h.dwX = 0; h.dwY = 0; h.dwGX = 0; h.dwGY = 0; h.dwVX = 0; h.dwVY = 0; h.dwCX = 0; h.dwCY = 0; h.dwPress = false; h.dwHold = false; h.dwReach = false;
  h.dSpd = 0; h.dOrb = 0; h.thAt = -1e9; h.foeId = ''; h.dnX = 0; h.dnY = 0; h.dnUntil = 0; h.dbKey = ''; h.dbGoX = 0; h.dbGoY = 0; h.dbGoUntil = 0; h.dbOffUntil = 0;
  h.dkAt = 0; h.dkIn = false; h.dkUntil = 0; h.dmHoldAt = 0; h.dcNext = 0; h.dcOk = 0; h.dcGX = -1; h.dcGY = -1; h.dcX = 0; h.dcY = 0; h.dcGoUntil = 0; h.ovAt = 0; h.ovOn = false; h.ovX = 0; h.ovY = 0;
  h.swV0 = 0; h.swTop = 0; h.swTurn = 5; h.swRad = 0; h.swLaw = 0; h.swLife = 0; h.swFrame = -9; h.swAt = 0; h.swCan = false; h.swFire = false; h.tvOn = false; h.tvR = -1;
  h.esNext = 0; h.esQX = 0; h.esQY = 0; h.esSpin = false; h.esPh = 0; h.esAt = 0;
  h.esD = 12;
  h.pcNext = 0; h.pcOk = false; h.pcX = 0; h.pcY = 0; h.pcLX = -1; h.pcLY = -1;
  h.awNext = 0; h.awOk = false; h.awX = 0; h.awY = 0; h.nwAt = 0;
  h.arRank = 0; h.arPend = 0; h.arPendAt = 0; h.arNext = 0; h.arG = 0; h.arM = 0; h.arL = 0; h.arOk = false; h.arTX = 0; h.arTY = 0; h.arDX = 0; h.arDY = 0; h.arTUntil = 0;
  h.adX = 0; h.adY = 0; h.adUntil = 0; h.adNext = 0; h.ahUntil = 0; h.ahId = ''; h.ahN = 0; h.dtSide = 0; h.dtAt = 0; h.arRest = 0; h.lvId = ''; h.lvUntil = 0; h.lvTurnAt = 0; h.lvBlk = 0; h.lvFh = 0; h.frN = 0; h.flAt = 0; h.flX = 0; h.flY = 0; h.cdAt = 0; h.cdOn = false; h.slId = ''; h.slN = 0; h.slAt = 0;
  h.evN = 0;
  h.arLs = 0; h.arLsAt = 0;
  h.owNext = 0; h.owX = 0; h.owY = 0; h.owK = 0;
  h.esL = 0;
  h.dwAt = 0; h.dwTick = 0; h.dwSince = 0; h.dwReachAt = 0; h.dwT = ''; h.ddHoldAt = -1; h.dFrame = -9; h.dN = 0; h.dAll = 0; h.dRad = 0;
  h.foeD2 = Infinity; h.foeX = 0; h.foeY = 0; h.foeNext = 0; h.fightAt = 0; h.trDone.fill(0); h.trHitAt.fill(0); h.hbId[0] = ''; h.hbId[1] = ''; h.hbId[2] = ''; h.hbId[3] = ''; h.hbAt.fill(0);
  h.foeSee = false; h.foeHot = false; h.hidWas = false; h.seeAt = 0; h.hvId = ''; h.hkUntil = 0; h.hkQuitId = '';
  h.hvR = 0; h.hvMem = false; h.hmUntil = 0; h.hqId = ''; h.hqAt = 0; h.hrSince = 0; h.hrAt = 0; h.rpAt = 0; h.gfAt = 0;
  h.wmC.fill(-1); h.wmH = 0; h.wmN = 0; h.wmArea = '';
  h.hitId = ''; h.hitUntil = 0;
  h.gAt = 0; h.gLd = ''; h.gN = 1; h.gCall = 0; h.gCallAt = 0; h.gSeen = 0; h.gFoe = 0; h.gOwn = 0; h.gMem = 0; h.gMemAt = 0; h.gPat = 0; h.gGoUntil = 0; h.gBackAt = 0; h.gKey = '';
  h.gDo = 0; h.gPend = 0; h.gDoAt = 0; h.gTk = ''; h.gKite = 0; h.gThere = false; h.gB = 0; h.gBAt = 0;
  h.ckN = 0; h.ckSince = 0; h.ckSeen = 0;
  h.udNext = 0; h.udUntil = 0; h.udSum = 0; h.udSince = 0; h.udAt = 0;
  h.rvId = ''; h.rvN = 0; h.rvSince = 0; h.rvLast = 0; h.rvHits = 0; h.rvStamp = 0; h.cfCoverAt = 0; h.cfIdx = -1; h.cfNext = 0; h.cfAt = 0;
  h.frHold = false; h.frAside = false; h.frAsideAt = 0; h.frNext = 0; h.frSince = 0; h.frSide = 0; h.frSX = 0; h.frSY = 0; h.frFree = 0; h.focRhino = false; h.tgR = 0; h.tgD = 0; h.tgWeak = false; h.tgAt = 0; h.fdId = ''; h.fdHp = 0; h.fdMiss = 0; h.fdTick = 0; h.foodAt = 0; h.lookPrev = ''; h.lookPrevAt = 0;
  h.rkN.fill(0); h.rkUntil.fill(0); h.rkV.fill(0);
}
export function feelRowOn(botFeel: BotFeelConfig | undefined, i: number): boolean {
  if (!FEEL_LIVE) return false;
  const r = FEEL_ROWS[i];
  if ((AI_CONSTANTS as unknown as Record<string, number>)[r.ai] === 0) return false;
  const e = botFeel && botFeel.rows ? botFeel.rows[r.key] : undefined;
  return !(e && (e.on === false || e.strength === 0));
}
export function hfIdNum(id: string): number {
  let x = 0x811C9DC5;
  for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 0x01000193);
  return x | 0;
}

const _DEG = Math.PI / 180;
export function hfHandT(h: HfState, nowMs: number): number {
  return 0.5 * Math.pow(3, 1 - h.dnaHand) * Math.exp((hfNoise(h.seed, 41, nowMs, 45000) - 0.5) * 0.53);
}
export function hfShakeRad(h: HfState, nowMs: number): number {
  const amp = (0.15 + 1.1 * hfHash(h.seed, 43, 0) * hfHash(h.seed, 44, 0)) * _DEG;
  return amp * (hfNoise(h.seed, 45, nowMs, 130 + 60 * hfHash(h.seed, 46, 0)) - 0.5) * 2;
}
export function hfReactMs(h: HfState, nowMs: number): number {
  const u = hfHash(h.seed, 47, nowMs | 0);
  return (180 + 240 * u * u) * (0.75 + 0.5 * (1 - h.dnaHand));
}
export function hfReactMs2(h: HfState, nowMs: number, kind: number): number {
  const u = hfHash(h.seed, 47, nowMs | 0), v = hfHash(h.seed, 147, nowMs | 0);
  const lo = kind === 0 ? 150 : kind === 1 ? 190 : kind === 2 ? 230 : 160;
  const hi = kind === 0 ? 380 : kind === 1 ? 640 : kind === 2 ? 1300 : 620;
  return lo + (hi - lo) * u * (0.35 + 0.65 * v);
}
const HF_BASIC_PUSH = 75.5;
const HF_BASIC_REAL = 1.4 * (3 * Math.log(2.224744871391589 + 1.4) + 1) * 1.8875;
export function hfTankFacts(h: HfState, turrets: ReadonlyArray<Turret>): void {
  let px = 0, py = 0, tot = 0, longest = 0, sect = 0, autos = 0, bpsMax = 0;
  const RF = AI_CONSTANTS.HF_RIDEFACTS !== 0; let rx = 0, ry = 0, rtot = 0, kbs = 0, kbm = 0;
  let swarm = false, units = 0, trapSect = 0, bulSect = 0;
  let chase = false, motor = false, led = 0;
  const U = AI_CONSTANTS.HF_UNITS !== 0;
  let autoSect = 0;
  let side = false, spn = 0, sp0 = 0, sp1 = 0, sp2 = 0, sp3 = 0;
  let minion = false, mled = 0, bpsLed = 0, sLed = false;
  for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i];
    if (t.turretType !== undefined && t.turretType !== 'regular') {
      if (t.turretType !== 'decorative') { autos++; const aa = t.angle || 0; autoSect |= 1 << ((((Math.round(Math.atan2(Math.sin(aa), Math.cos(aa)) / (Math.PI / 4)) % 8) + 8) % 8)); }
      continue;
    }
    if (t.altFire === true) continue;
    const k = (t.knockback || 0) * (t.bps || 0);
    const a = t.angle || 0;
    {
      const pt = t.projectileType, mo = pt ? pt.motionType : undefined, vi = pt ? pt.visual : undefined;
      const sb = 1 << ((((Math.round(Math.atan2(Math.sin(a), Math.cos(a)) / (Math.PI / 4)) % 8) + 8) % 8));
      if (U) {
        const pb = t.projectileBehaviors; let fm = false, ind = false, mc = false;
        if (pb) for (let j = 0; j < pb.length; j++) { if (!pb[j].enabled) continue; const ty = pb[j].type; if (ty === 'followMouse') fm = true; else if (ty === 'independentProjectile') ind = true; else if (ty === 'minionControl') mc = true; }
        const cap = pt && (pt.maxAlive || 0) > 0 ? (pt.maxAlive || 0) : 4;
        if (mo === 'swarm' || vi === 'swarm') { swarm = true; if (fm && !ind) sLed = true; }
        else if (vi === 'trap') trapSect |= sb;
        else if (mo === 'chase' || mo === 'motor') {
          if (pt && (pt.lifetime || 0) > 0) { swarm = true; if ((fm || mc) && !ind) sLed = true; }
          else if (mo === 'motor') { motor = true; if (mc && !ind) { minion = true; mled += cap; bpsLed += t.bps || 0; if (spn === 0) sp0 = a; else if (spn === 1) sp1 = a; else if (spn === 2) sp2 = a; else if (spn === 3) sp3 = a; spn++; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.35) side = true; } units += cap; }
          else { if (fm && !ind) { chase = true; led += cap; bpsLed += t.bps || 0; if (spn === 0) sp0 = a; else if (spn === 1) sp1 = a; else if (spn === 2) sp2 = a; else if (spn === 3) sp3 = a; spn++; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.35) side = true; } units += cap; }
        }
        else if ((t.bps || 0) > 0) bulSect |= sb;
      }
      else if (mo === 'swarm' || vi === 'swarm') swarm = true;
      else if (mo === 'chase' || mo === 'motor') {
        if (mo === 'motor') motor = true;
        else {
          const pb = t.projectileBehaviors; let fm = false, ind = false;
          if (pb) for (let j = 0; j < pb.length; j++) { if (!pb[j].enabled) continue; if (pb[j].type === 'followMouse') fm = true; else if (pb[j].type === 'independentProjectile') ind = true; }
          if (fm && !ind) { chase = true; led += pt && (pt.maxAlive || 0) > 0 ? (pt.maxAlive || 0) : 4; }
        }
        units += pt && (pt.maxAlive || 0) > 0 ? (pt.maxAlive || 0) : 4;
      }
      else if (vi === 'trap') trapSect |= sb;
      else if ((t.bps || 0) > 0) bulSect |= sb;
    }
    if ((t.bps || 0) > 0) { sect |= 1 << ((((Math.round(Math.atan2(Math.sin(a), Math.cos(a)) / (Math.PI / 4)) % 8) + 8) % 8)); if ((t.bps || 0) > bpsMax) bpsMax = t.bps || 0; }
    if (!(k > 0)) continue;
    px -= Math.cos(a) * k; py -= Math.sin(a) * k; tot += k;
    if (RF) { const r = (t.knockback || 0) * 0.035, sp = r * (3 * Math.log(2.224744871391589 + r) + 1) * (t.bps || 0); rx -= Math.cos(a) * sp; ry -= Math.sin(a) * sp; rtot += sp; kbs += t.bps || 0; if ((t.bps || 0) > kbm) kbm = t.bps || 0; }
    if ((t.length || 0) > longest) longest = t.length || 0;
  }
  const len = Math.sqrt(px * px + py * py);
  h.boostK = len / HF_BASIC_PUSH; h.boostPhi = Math.atan2(py, px); h.boostCancel = tot > 0 ? 1 - len / tot : 1; h.boostSniper = longest >= 11;
  h.boostCan = h.boostK >= 0.45 && h.boostCancel < 0.7 && !h.boostSniper && Math.cos(h.boostPhi) <= -0.5;
  if (RF) {
    const rl = Math.sqrt(rx * rx + ry * ry);
    h.boostK = rl / HF_BASIC_REAL; h.boostPhi = Math.atan2(ry, rx); h.boostCancel = rtot > 0 ? 1 - rl / rtot : 1; h.boostSniper = longest >= 11 && kbs < 2.2;
    h.boostCan = h.boostCancel < 0.7 && !h.boostSniper && h.boostK >= (kbm < 1 ? 0.7 : 0.45);
  }
  let c = 0; for (let b = sect; b !== 0; b &= b - 1) c++;
  h.cover = autos > 0 ? 8 : c; h.bpsMax = bpsMax; h.autos = autos;
  let kind = 0, pp = 0;
  if (swarm) kind = 1;
  else if (units > 0 && !(U && AI_CONSTANTS.HF_UNITOWN !== 0 && led === 0 && mled === 0 && (trapSect !== 0 || bulSect !== 0 || autos > 0))) { kind = 2; pp = (units - 1) / 5; if (pp > 1) pp = 1; else if (pp < 0) pp = 0; }
  else if (trapSect !== 0) { let n = 0; for (let b = trapSect; b !== 0; b &= b - 1) n++; kind = n <= 2 ? 3 : 4; }
  else if (bulSect !== 0) kind = (bulSect & ~0x11) === 0 ? 5 : 6;
  else if (autos > 0) kind = AI_CONSTANTS.HF_AREA !== 0 && autoSect !== 0 && (autoSect & ~0x11) === 0 ? 5 : 6;
  h.placeKind = kind; h.placeP = pp;
  h.dKind = motor ? 2 : chase ? 1 : 0; h.dMax = led;
  if (U) { h.dKind = swarm ? 0 : chase ? 1 : minion ? 2 : 0; h.dMax = chase ? led : mled; h.dBps = bpsLed; h.sLed = swarm && sLed; }
  else { h.dBps = 0; h.sLed = false; }
  h.spN = U ? (spn > 4 ? 4 : spn) : 0; h.spA0 = sp0; h.spA1 = sp1; h.spA2 = sp2; h.spA3 = sp3;
  h.arSide = side; h.arBul = bulSect === 0 ? 0 : (bulSect & ~0x11) === 0 ? 1 : 2;
}

const _S = Math.SQRT1_2;
export const HF_KEY_X = [1, _S, 0, -_S, -1, -_S, 0, _S];
export const HF_KEY_Y = [0, _S, 1, _S, 0, -_S, -1, -_S];
const KEY_KEEP = 0.75;
export function hfKeyStep(h: HfState, ang: number, nowMs: number, finger: boolean = false): number {
  const slot = (((ang / (Math.PI / 4)) % 8) + 8) % 8;
  let want = Math.round(slot) % 8;
  const k = h.keyIdx;
  if (k >= 0 && want !== k) {
    let d = slot - k; if (d < 0) d = -d; if (d > 4) d = 8 - d;
    if (d <= KEY_KEEP) want = k;
    else if (d < 2 && nowMs - h.keyAt < (finger ? 200 + 250 * hfNoise(h.seed, 31, nowMs, 20000) : 90 + 180 * hfNoise(h.seed, 31, nowMs, 20000))) want = k;
    else if (finger && nowMs - h.keyAt < 70 + 70 * hfNoise(h.seed, 32, nowMs, 9000)) want = k;
  }
  if (want !== k) { h.keyIdx = want; h.keyAt = nowMs; }
  return want;
}
