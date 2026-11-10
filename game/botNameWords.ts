const words = (s: string): readonly string[] => s.trim().split(/\s+/);

export const NW_HANDLE = words(`
Viper Cobra Mamba Python Raven Crow Hawk Falcon Eagle Osprey Condor Vulture Owl Wolf Fox Jackal Hyena
Coyote Lynx Puma Cougar Panther Jaguar Leopard Tiger Lion Bear Grizzly Kodiak Rhino Bison Moose Stag
Ram Bull Boar Badger Wolverine Mongoose Ferret Otter Shark Orca Marlin Barracuda Piranha Manta Stingray
Squid Kraken Hydra Scorpion Tarantula Mantis Hornet Wasp Locust Beetle Firefly Moth Dragon Drake Wyvern
Wyrm Basilisk Chimera Griffin Phoenix Pegasus Unicorn Cerberus Fenrir Leviathan Behemoth Minotaur
Cyclops Golem Gargoyle Goblin Gremlin Ogre Troll Yeti Sasquatch Banshee Wraith Specter Phantom Ghost
Ghoul Zombie Vampire Werewolf Lich Demon Imp Djinn Sphinx Raptor Rex Mammoth Sabertooth Gecko Iguana
Chameleon Komodo Gator Croc Turtle Tortoise Penguin Puffin Pelican Toucan Parrot Macaw Finch Sparrow
Robin Heron Swan Koala Panda Sloth Lemur Gibbon Gorilla Baboon Mandrill Meerkat Hedgehog Porcupine
Armadillo Platypus Wombat Dingo Kangaroo Walrus Narwhal Beluga Dolphin Seal Lobster Crab Shrimp
Jellyfish Urchin Starfish Seahorse Capybara Raccoon Possum Llama Alpaca Yak Ibex Oryx Gazelle Jaguarundi

Shadow Shade Dusk Gloom Reaper Grim Havoc Chaos Mayhem Fury Rage Wrath Doom Dread Bane Blight Ruin
Wreck Rampage Vortex Abyss Void Eclipse Nightmare Omen Hex Curse Jinx Karma Vendetta Menace Outlaw
Bandit Rogue Renegade Maverick Rebel Savage Brute Feral Vandal Villain Nemesis Rival Stalker Prowler
Lurker Hunter Predator Slayer Striker Raider Reaver Marauder Ravager Punisher Enforcer Avenger
Vindicator Crusader Conqueror Destroyer Annihilator Obliterator Terminator Eradicator Desolator
Devastator Dominator Tormentor Intimidator Warlord Warhead Warpath Deadshot Hitman Assassin Mercenary
Commando Sniper Marksman Gunslinger Sharpshooter Trigger Bullet Shrapnel Grenade Dynamite Gunpowder
Torpedo Missile Cannon Mortar Howitzer Bazooka Railgun Flamethrower Blackout Lockdown Meltdown
Showdown Overkill Overdrive Overload Overtime Aftermath Aftershock Backlash Whiplash Deathwish

Blaze Ember Inferno Flame Flare Pyro Scorch Cinder Ash Soot Smoke Magma Lava Frost Glacier Icicle
Blizzard Avalanche Tundra Permafrost Storm Thunder Lightning Tempest Cyclone Tornado Hurricane Typhoon
Monsoon Tsunami Maelstrom Whirlpool Quake Tremor Boulder Granite Obsidian Onyx Flint Basalt Cobalt
Titanium Tungsten Chrome Mercury Carbon Neon Argon Xenon Krypton Radon Helium Plasma Photon Proton
Neutron Electron Quark Atom Ion Volt Watt Tesla Joule Surge Spark Static Flux Pulse Ripple Echo Sonic
Boom Blast Shockwave Nova Supernova Comet Meteor Asteroid Nebula Quasar Pulsar Galaxy Cosmos Orbit
Zenith Apex Summit Horizon Aurora Solstice Equinox Twilight Midnight Daybreak Sunrise Sunset Moonlight
Starlight Stardust Skyfall Rainfall Snowfall Nightfall Wildfire Hellfire Bonfire Backfire Crossfire
Sandstorm Firestorm Icestorm Hailstorm Thunderclap Whirlwind Downpour Landslide Rockslide Mudslide

Zeus Odin Thor Loki Ares Hades Apollo Hermes Atlas Titan Kronos Hyperion Prometheus Poseidon Anubis
Osiris Horus Freya Tyr Baldur Heimdall Athena Artemis Nyx Hecate Medusa Ajax Achilles Hector
Perseus Orion Icarus Hercules Theseus Odysseus Merlin Arthur Lancelot Galahad Percival Mordred Morgana
Excalibur Mjolnir Gungnir Ragnarok Valhalla Asgard Olympus Avalon Camelot Atlantis Elysium Tartarus
Styx Lethe Valkyrie Berserker Samurai Shogun Ronin Ninja Shinobi Daimyo Viking Spartan Gladiator
Centurion Legionnaire Templar Paladin Knight Squire Baron Duke Count Earl Monarch Emperor Kaiser Czar
Pharaoh Sultan Khan Chieftain

Cipher Glitch Pixel Vector Matrix Binary Proxy Kernel Daemon Vertex Quantum Cyber Nano Laser Radar
Sonar Turbo Nitro Diesel Rocket Jet Drone Mecha Android Cyborg Synth Robot Circuit Chip Byte Bit Null
Cache Stack Heap Loop Macro Script Shell Coder Debug Compiler Syntax Runtime Overclock Firewall Bug
Patch Reboot Shutdown Override Uplink Downlink Mainframe Server Node Router Modem Signal Latency Ping
Packet Protocol Algorithm Cryptic Enigma

Ranger Scout Tracker Pathfinder Wayfarer Wanderer Nomad Drifter Vagabond Pilgrim Voyager Explorer
Pioneer Trailblazer Captain Major Colonel General Admiral Marshal Sergeant Corporal Cadet Rookie
Veteran Sheriff Deputy Agent Operative Spy Sleuth Detective Inspector Pilot Aviator Gunner Bomber
Tanker Medic Engineer Mechanic Technician Architect Alchemist Wizard Warlock Sorcerer Mage Shaman
Druid Monk Oracle Sage Mystic Seer Bard Jester Joker Ace King Queen Prince Princess Lord Lady
Boss Chief Champ Champion Hero Legend Myth Icon Idol Rockstar Superstar Maestro Virtuoso Prodigy
Genius Mastermind Kingpin Overlord Supreme Prime Alpha Omega Sigma Delta Gamma Beta Zeta Theta Lambda

Blitz Rush Dash Bolt Zap Zip Snap Clash Crash Smash Bash Slash Crush Flash Clutch Dunk Slam Jolt Kick
Punch Jab Hook Swipe Strike Shot Scope Aim Lock Reload Recoil Ricochet Volley Salvo Barrage Ambush
Flank Siege Raid Charge Onslaught Vanguard Bulwark Bastion Citadel Fortress Rampart Stronghold Outpost
Garrison Arsenal Armory Bunker Trench

Potato Banana Toast Waffle Pickle Noodle Taco Nacho Cookie Muffin Pancake Bacon Cheese Donut Pizza
Burrito Nugget Biscuit Pretzel Popcorn Pudding Dumpling Meatball Pepperoni Cupcake Brownie
Marshmallow Jellybean Gumdrop Lollipop Cheeseburger Spaghetti Lasagna Ravioli Macaroni Guacamole
Avocado Coconut Pineapple Mango Papaya Kiwi Turnip Radish Cabbage Spinach Zucchini Pumpkin Walnut
Peanut Cashew Pistachio Almond
`);

export const NW_ADJ = words(`
Dark Silent Toxic Savage Crazy Lazy Angry Happy Sad Tiny Big Giant Mini Sneaky Salty Spicy Sweaty
Sleepy Hungry Lucky Unlucky Epic Mega Ultra Hyper Super Turbo Atomic Cosmic Electric Frozen Burning
Golden Silver Iron Steel Crimson Scarlet Azure Red Blue Green Purple Neon Royal Ancient
Eternal Fallen Lost Broken Cursed Wicked Evil Divine Infernal Feral Wild Mad Insane Lethal Deadly
Fatal Brutal Ruthless Fearless Reckless Relentless Merciless Restless Nameless Faceless Heartless
Soulless Endless Lone Solo Rogue Stealth Swift Rapid Quick Fast Heavy Mighty Grand Supreme Prime Alpha
Omega Elite Pro Noob Casual Tryhard Cracked Clutch Based Chill Cozy Grumpy Sassy Fluffy Fuzzy Crispy
Crunchy Soggy Rusty Dusty Shiny Shady Shifty Tricky Sly Slick Smooth Rough Raw Bold Brave Proud Humble
Noble Loyal Mystic Arcane Astral Lunar Solar Stellar Galactic Radiant Luminous Glowing Blazing Molten
Arctic Polar Stormy Thunder Shadow Phantom Ghost Hollow Void Grim Bleak Pale Dim Murky Hidden Secret
Unknown Invisible Invincible Immortal Undead Demonic Angelic Chaotic Lawful Neutral Rabid Vicious
Furious Raging Wrathful Vengeful Bitter Sour Sweet Tasty Yummy Stinky Smelly Clean Fresh Stale
Moldy Rotten Spooky Creepy Eerie Haunted Wacky Zany Goofy Silly Derpy Dizzy Wobbly Clumsy Awkward
Confused Bored Tired Wired Jittery Twitchy Jumpy Bouncy Springy Squishy Slimy Greasy Oily Crusty
Flaky Chunky Chubby Skinny Tall Short Wide Flat Round Square Sharp Blunt Pointy Spiky
Prickly Hairy Bald Bearded Masked Hooded Armored Winged Horned Fanged Clawed Scaly Feathered Furry
Striped Spotted Speckled Rainbow Pixel Retro Vintage Classic Modern Future Cyber Digital Virtual
Quantum Binary Random Certified Official Original Fake Real True False Legit Sus Sketchy Dodgy Cheeky
Saucy Zesty Peppy Perky Jolly Merry Cheerful Gloomy Moody Broody Stoic Calm Zen Serene Peaceful Gentle
Tender Soft Tough Rugged Gritty Hardcore Extreme Radical Gnarly Sick Dope Lit Icy Frosty Chilly
Cool Warm Fiery Smoky Ashen Sooty Sandy Rocky Stony Muddy Swampy Mossy Leafy Woody Grassy
Thundering Roaring Howling Screaming Whispering Laughing Crying Dancing Flying Falling Rising Running
Sleeping Dreaming Wandering Drifting Floating Sinking Freezing Melting Glitching Lagging Camping
Farming Grinding Midnight Daylight Twilight Sunset Winter Summer Autumn Last First Final
Elder Young Old New Little Great Double Triple Half Zero Infinite Major Minor
`);

export const NW_NOUN = words(`
Slayer Hunter Killer Reaper Sniper Striker Raider Rider Walker Runner Seeker Stalker Breaker Crusher
Smasher Basher Slasher Shredder Destroyer Wrecker Bringer Bender Caster Dancer Dreamer Drifter Fighter
Gamer Master Lord King Queen Knight Wolf Dragon Tiger Viper Ghost Demon Angel Soul Heart Mind Blade
Sword Fang Claw Wing Storm Flame Fire Frost Ice Shadow Night Moon Star Sun Sky Void Bolt Strike Shot
Blast Bomb Rocket Bullet Cannon Tank Turret Drone Trap Machine Legend Myth Titan Beast Monster Phantom
Wizard Ninja Samurai Pirate Bandit Cowboy Panda Penguin Potato Banana Noodle Pickle Waffle Toaster
Goblin Gremlin Troll Ogre Hamster Duck Goose Llama Sloth Otter Raccoon Possum Capybara Frog Toad Gecko
Lizard Shrimp Crab Squid Octopus Whale Hawk Eagle Raven Crow Fox Bear Lion Shark Cobra Scorpion Spider
Mantis Hornet Wasp Bee Ant Moth Bat Rat Cat Dog Pup Kitten Bunny Chicken Turkey Pigeon Parrot Monkey
Gorilla Yeti Alien Robot Cyborg Android Mech Bot Clone Mutant Zombie Vampire Skeleton Mummy Witch
Warlock Mage Monk Paladin Rogue Ranger Bard Druid Shaman Necromancer Summoner Sorcerer Alchemist
Blacksmith Miner Farmer Fisher Baker Chef Barber Doctor Nurse Teacher Student Professor Scientist
Astronaut Pilot Captain Sailor Soldier General Sergeant Chief Boss Champ Hero Villain Outlaw Sheriff
Marshal Hitman Assassin Spy Agent Thief Burglar Smuggler Mercenary Gladiator Warrior Barbarian Viking
Spartan Crusader Templar Guardian Sentinel Warden Keeper Watcher Protector Defender Avenger Punisher
Enforcer Juggernaut Colossus Goliath Behemoth Leviathan Kraken Hydra Phoenix Griffin Wyvern Basilisk
Chimera Cerberus Minotaur Cyclops Golem Gargoyle Banshee Wraith Specter Poltergeist Shade Revenant
Lich Fiend Imp Djinn Genie Spirit Sprite Fairy Pixie Elf Dwarf Gnome Giant Hammer Axe Spear Lance
Dagger Arrow Bow Shield Helm Crown Throne Scepter Banner Flag Tower Castle Fortress Bunker Vault Forge
Anvil Engine Motor Piston Gear Cog Wrench Laser Plasma Photon Proton Neutron Quark Atom Comet Meteor
Nova Nebula Galaxy Planet Orbit Eclipse Vortex Tornado Tsunami Quake Volcano Avalanche Blizzard Thunder
Lightning Tempest Inferno Ember Cinder Spark Blaze Flare Fury Rage Wrath Chaos Havoc Mayhem Doom Dread
Fear Terror Panic Nightmare Dream Wish Hope Luck Fate Destiny Karma Glory Honor Valor Pride Justice
Vengeance Revenge Mercy Sorrow Misery Agony Pain Joy Bliss Echo Whisper Scream Howl Roar Growl Snarl
Bite Sting Punch Kick Slap Bonk Yeet Nugget Biscuit Muffin Cookie Donut Taco Burrito Pizza Sandwich
Meatball Dumpling Pancake Cupcake Pudding Pretzel Popcorn Cheese Bacon Toast Bagel Croissant
Baguette Spaghetti Ramen Sushi Wasabi Tofu Turnip Carrot Onion Garlic Cabbage Pumpkin Coconut Mango
Lemon Melon Cherry Berry Sock Shoe Boot Hat Pants Spoon Fork Chair Couch Lamp Brick Bucket Barrel Crate
Rock Pebble Stick Twig Leaf Tree Cactus Mushroom
Death Peace Police Player
`);

export const NW_FIRST = words(`
Leon Alex Max Sam Ben Tom Jack Luke Noah Liam Ethan Mason Logan Lucas Oliver Leo Kai Finn Jake Ryan
Kyle Tyler Dylan Cody Josh Nick Mike Dave Steve Bob Jeff Greg Karl Hans Ivan Igor Boris Dmitri Sasha
Misha Pavel Luca Marco Matteo Diego Carlos Pablo Juan Pedro Mateo Rafa Hugo Louis Pierre Jean Yuki
Hiro Kenji Ryu Sora Ren Haru Akira Takumi Jin Min Wei Chen Raj Ravi Arjun Rohan Aryan Vivek Sachin
Rahul Amit Deepu Ankit Kunal Vishal Ayush Omar Ali Hassan Yusuf Amir Karim Tariq Sabbir Hussain Emre
Mert Ahmet Kemal Mia Zoe Lily Emma Ava Luna Ruby Ivy Nora Maya Anna Eva Elsa Nina Lena Sofia Lucia
Chloe Sakura Yuna Hana Mei Riya Priya Ananya Aisha Zara Leila Felix Oscar Otto Axel Erik Lars Sven
Bjorn Nils Olaf Gus Hank Earl Walt Stan Ned Ted Bill Will Jim Tim Dan Ron Don Ken Len Ray Roy Jay
Lee Zack Cole Chase Blake Drew Reid Seth Troy Wade Zane Jace Knox Rhys Nico Enzo Dante Rocco Vito
Tony Vinny Sal Gino Aldo Ezra Levi Asher Silas Milo Arlo Theo Remy Beau Jude Kian Aiden Caleb Eli
Isaac Jonah Micah Owen Evan Gavin Colin Sean Declan Ronan Conor Cian Niall Rory Angus Hamish
Callum Ewan Fraser Bruce Clyde Floyd Lloyd Boyd Ross Scott Craig Keith Neil Ian Alan Colm Tara Erin
Nell Tess Bea Fay Gwen Jade Kate Liv Mae Peg Rae Sue Val Wren Yara Zelda Xena Kira Mira Nyla Opal
Pia Quinn Rhea Skye Thea Uma Vera Willa Ada Bree Cleo Dana Edie Flo Gia Hope Ines Joy Kaya Lola
`);

export const NW_COIN_A = words(`
Zey Kae Vy Ry Xe Ny Ve Kry Dra Za Ko Vo Lu No Ty Fe Ja Ka Ze Hy Jy So Ae Aze Bry Cae Cy Da De Fy Gry
Ha Jo Ke Ky La Ly Ma Mi My Ni Ory Pa Py Qo Ra Rhy Ri Sy Ska Ta Te Tha To Tre Va Vi Wy Xa Xi Xo
Ya Yo Zi Zo Zu Zy Bra Bre Bri Bro Cra Cre Cri Cro Dre Dri Dro Fra Fre Fri Fro Gra Gre Gri Gro Kra Kre
Kri Kro Pra Pre Pri Sta Ste Sto Sty Stra Stri Vra Vre Vri Zra Zre Zri Bla Ble Bli Blo Cla Cle Clo
Fla Fle Fli Flo Gla Gle Gli Glo Kle Klo Pla Ple Pli Plo Sle Sli Slo Aly Ely Ily Oly Ava Eva
Iva Eza Iza Oza Era Ura Axa Exa Ixa Oxa Kyo Ryo Myo Nyo Kai Rai Zai Vai Tai Rei Kei
Zei Vei Kou Rou Zou Sou Lia Nia Mia Ria Zia Via Tia Neo Rio Tio Zeo Veo
`);

export const NW_COIN_MID = words(`
ry ly za zo va vy xa
`);

export const NW_COIN_B = words(`
rox rix rex rax ryx ron ris rus ro rion reon lix lex lox lyx lon lor lar lus lis lio nix nex nox nyx
non nor nar nis vex vox vyn ven vax vor var zar zor zen zel zax zo zon zer kon kar kor kel kyn dax dor
dris drax dyn den dar dex don thor thar thyn thos mir mor mar myr mox max tor trix tyx tex ton tos
`);

export const NW_COIN_CODA = words(`
x z n r
`);

export const NW_TITLE = words(`
Mr Sir Lord Lady King Queen Dr Prof Capt Captain Sgt Major Agent Uncle Papa Lil Big
El Don The Itz Its Im Just Only Real TheReal Pro Chef Coach Judge Mayor Baron
`);

export const NW_TAG = words(`
YT TTV GG HD Pro Jr X Z xD OP Gaming Plays Playz TV FF Live Gamer Bot AFK II III XL Prime Zero
One Max Plus Ultra Lite Main King Boss Fan Guy Dude Bro Kid Boi Man Cat Dog Mobile
`);

export const NW_N2_A = words(`
Born Ready Here Made Built Back Love Live Time Free Hard Easy Hungry Bound
`);
export const NW_N2_B = words(`
Win Fight Play Roll Rule Fly Run Farm Grind Hunt Smash Shoot Spin Dodge Snipe Build Chill Party Dance
Sleep Eat Snack Lose
`);

export const NW_TINY = words(`
gg ez op ok yo hi xd lol pro ace afk brb idk owo uwu oof yes wow bro sup hey pog gl hf zzz hmm meh yay
boo huh
`);

export const NW_CLAN = words(`
ZQ DR SK MG TGR AGT NXT RS VIP GT FX VX KZ NX ZX QT XD OP GG EZ TTV YT HD TM RX GX DX MX JR XL V2 VR
NPC AFK PRO BOT TRY WIN LOL RIP MVP GOAT CEO ACE ICE FIRE DARK NOVA APEX ZERO ONE WAR RAW MAX REX
`);

export const NW_FUNNY = words(`
potato banana toast waffle pickle noodle taco nacho cookie muffin pancake bacon cheese donut pizza
burrito nugget biscuit pretzel popcorn pudding dumpling meatball cupcake brownie spaghetti
ravioli avocado coconut pineapple mango turnip cabbage pumpkin peanut sandwich bagel croissant
baguette ramen sushi tofu carrot onion garlic lemon melon cherry sock shoe boot hat spoon fork chair
couch lamp brick bucket barrel crate rock pebble stick twig leaf tree cactus mushroom duck goose egg
llama sloth otter raccoon possum capybara frog toad gecko shrimp crab hamster pigeon chicken turkey
penguin panda goblin gremlin troll toaster fridge microwave blender printer stapler keyboard mouse
`);

export const NW_KIND = words(`
brave bold great mighty swift lucky sleepy hungry happy tiny big sneaky silent calm chill cool epic
grand noble proud humble loyal fearless golden legendary quick clever wise jolly merry cheerful gentle
cosmic lunar solar stellar radiant shiny fluffy cozy zen fast tall small quiet curious busy sunny
`);

export const NW_TANK = words(`
twin sniper pounder director trapper smasher destroyer overseer overlord necro booster fighter triplet
octo penta gunner ranger stalker annihilator hybrid builder spike landmine basic auto skimmer
streamliner predator manager factory battleship carrier cruiser assassin hunter rocketeer spawner
`);

export const NW_PHRASE: readonly string[] = `
{a} {f}
{a} {f}
the {a} {f}
{n} the {k}
i am {f}
im {a}
not {h}
not {n}
{f} enjoyer
{f} lover
{f} hater
{f} gang
team {f}
mr {f}
sir {f}
lord {f}
king {f}
dr {f}
captain {f}
{t} main
{t} main
{t} god
{t} only
{t} enjoyer
pro {t}
bad {t}
noob {t}
{a} {t}
ex {t} main
i hate {t}s
no {t}s pls
{t} is op
nerf {t}
buff {t}
{d} iq
ping {d}
{d} fps
level {d}
day {d}
{n}s tank
{n} was here
{n} is afk
ask {n}
blame {n}
its {n}
{n} jr
lil {n}
big {n}
uncle {n}
{n} irl
{n} but {k}
{k} {n}
just {n}
only {n}
{n} again
{n} {d}
{h} {d}
{f} {d}
just a {f}
just a {t}
just a {h}
not a bot
not a {f}
i am {a}
i am the {f}
im a {f}
im not a {f}
im just {k}
hi im {h}
hello {f}
the {f} king
the {h}
the real {h}
the {a} one
a {a} {f}
a random {f}
one {a} {f}
me and my {f}
my {f}
my {t}
your {a} {f}
you are {k}
i like {f}s
idk {f}
{f} pls
{t} pls
pls no {t}s
can i be {t}
this is {h}
from the {f}
{f} police
{t} police
pet {f}
free {f}
top {t}
random {t}
mobile {t}
{t} player
{f} player
team {h}
no name
{f} of death
{f} killer
{h} was here
{f} is love
peace and {f}s
be {k}
{h} on mobile
`.trim().split('\n');
