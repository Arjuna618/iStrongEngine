import React, { forwardRef } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Archive02Icon, ArrowLeft02Icon, ArrowLeftRightIcon, ArrowUp02Icon, ArrowUpDownIcon, BookOpen01Icon,
  BotIcon, CubeIcon, Bug02Icon, Tick02Icon, CheckmarkCircle02Icon, ArrowDown01Icon, ArrowRight01Icon,
  DashedLineCircleIcon, Copy01Icon, PlusSignIcon, CrosshairIcon, DiceIcon, Dna01Icon, Download01Icon,
  MaskTheater01Icon, EraserIcon, LinkSquare02Icon, ViewIcon, ViewOffSlashIcon, Forward02Icon,
  FileCodeIcon, FingerPrintIcon, Fire02Icon, FlaskConicalIcon, FolderDownloadIcon,
  FolderOpenIcon, GameController03Icon, DashboardSpeed02Icon, Pacman02Icon, FavouriteIcon, Home07Icon,
  Image01Icon, InformationCircleIcon, Joystick02Icon, KeyboardIcon, Layers01Icon, LayersPlusIcon,
  Idea01Icon, Link01Icon, Unlink01Icon, Loading03Icon, SquareLock02Icon, Logout01Icon, MapsIcon,
  Megaphone02Icon, MinusSignIcon, Moon02Icon, OctagonIcon, PackageIcon, SidebarRight01Icon, SidebarLeft01Icon, PauseIcon,
  PentagonIcon, PlayIcon, PowerIcon, RabbitIcon, Redo03Icon, Undo02Icon, Redo02Icon, Search01Icon,
  SearchRemoveIcon, Settings01Icon, Settings05Icon, Shapes01Icon, Shield01Icon, ShieldAlertIcon,
  ShieldOffIcon, ShieldPlusIcon, ShuffleIcon, SlidersHorizontalIcon, DoorOpenIcon, Plant01Icon,
  SquareIcon, SquareDashedIcon, Menu01Icon, StarIcon, Sun03Icon, Target02Icon, Delete02Icon,
  Alert02Icon, Undo03Icon, Upload01Icon, UserIcon, UserSettings01Icon, UserAdd01Icon,
  UserMultipleIcon, MagicWand01Icon, Wrench01Icon, Cancel01Icon, CancelCircleIcon, CornerDownRightIcon, CursorMagicSelection04Icon, CenterFocusIcon,
  CanvasIcon, DiscordIcon, CrossIcon, Recycle03Icon, GlobalIcon, BrickWallIcon, StoneIcon, TestTube01Icon,
  DressingTable03Icon, Navigation05Icon, MagnetIcon, CursorCircleSelection02Icon, CircleQuestionMarkIcon, MonitorSmartphoneIcon,
  DashboardSquareAddIcon, PreferenceHorizontalIcon, LayerIcon, FingerprintPatternIcon, AiBrain01Icon, DashboardSquareSettingIcon, ArrowAllDirectionIcon, PaintBoardIcon, FileQuestionMarkIcon, GunIcon, GameIcon, AmbulanceIcon, SettingDone01Icon, ListIcon, GlobalRefreshIcon, SphereIcon, FileManagementIcon, InboxDownloadIcon, LibraryIcon, ArtificialIntelligence07Icon, FileAttachmentIcon, AiSwapIcon, AppWindowIcon, Image03Icon, ListSettingIcon, DeveloperIcon,
  AiSparklesIcon,
  ShuffleSquareIcon,
  GeometricShapes01Icon,
        BrainCircuitIcon,
  AiElementsIcon,
  AiDrawingIcon,
  MouseRightClick04Icon,
  RectangleCircleIcon,
  BlackHoleIcon, GolfHoleIcon,
  AnalyticsUpIcon, Chart02Icon, TestTube03Icon,
  DashboardSpeed01Icon, CaduceusIcon, AiCoEditingIcon, UserGroup03Icon, Asteroid02Icon, MagicWand03Icon,
  EyeIcon, BombIcon, Blockchain03Icon, ColorPickerIcon, PhysicsIcon, PendulumIcon, JokerIcon, FileUserIcon,
  ArtificialIntelligence03Icon, BoxingGlove01Icon, FingerPrintScanIcon,
  TriangleAlertIcon, MessageSquareWarningIcon,
  ActivityCircleIcon, RankingIcon, LabelIcon,
} from '@hugeicons/core-free-icons';
import { SkullIcon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import { Profile02Icon, Store03Icon, NewReleasesIcon } from '@hugeicons/core-free-icons';
import { PaintBrush04Icon } from '@hugeicons/core-free-icons';
import { ScanEyeIcon } from '@hugeicons/core-free-icons';
import {
  HealthIcon, BulletIcon, SparklesIcon, RadarIcon,
  HashtagIcon, StopWatchIcon, Activity01Icon, RamMemoryIcon, BandageIcon, Bug01Icon,
  Tag01Icon, UserStarIcon, Target01Icon, Location01Icon, DangerIcon, Orbit01Icon, Sad01Icon, WaypointsIcon,
  BrickWallFireIcon, CornerUpRightIcon, ArrowMoveUpRightIcon, SnailIcon, CrownIcon, BowArrowIcon, DroneIcon,
  RadiusIcon, FireIcon, AnchorIcon, FootprintsIcon, RouteBlockIcon, FlagOffIcon, RulerDimensionLineIcon,
  UserArrowLeftRightIcon, BoxingGloveIcon, ShieldEnergyIcon, TimeQuarterIcon, Angle01Icon, BinocularsIcon,
  ArrowTurnBackwardIcon, MazeIcon, HourglassIcon, SwordsIcon, RunningShoesIcon, SquareArrowShrink01Icon,
  RepairIcon, CpuIcon, ChartColumnIcon, DiamondIcon,
} from '@hugeicons/core-free-icons';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
}
export type AppIcon = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
export type LucideIcon = AppIcon;

const STROKE = 1.5;
const MIN_REAL_STROKE = 1.25;

function make(icon: IconSvgElement, cls: string): AppIcon {
  const C = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 24, strokeWidth, absoluteStrokeWidth = false, className, style, ...rest }, ref,
  ) {
    const px = typeof size === 'number' ? size : parseFloat(size) || 24;
    const sw = strokeWidth ?? (absoluteStrokeWidth ? STROKE : Math.max(STROKE, (MIN_REAL_STROKE * 24) / px));
    return (
      <HugeiconsIcon
        ref={ref}
        icon={icon}
        size={size}
        strokeWidth={sw}
        absoluteStrokeWidth={absoluteStrokeWidth}
        className={className ? `k-svg ${cls} ${className}` : `k-svg ${cls}`}
        style={{ ['--k-ico' as string]: px, ...style } as React.CSSProperties}
        {...rest}
      />
    );
  });
  C.displayName = cls;
  return C;
}

export const Archive = make(Archive02Icon, 'lucide-archive');
export const ArrowLeft = make(ArrowLeft02Icon, 'lucide-arrow-left');
export const ArrowLeftRight = make(ArrowLeftRightIcon, 'lucide-arrow-left-right');
export const ArrowUp = make(ArrowUp02Icon, 'lucide-arrow-up');
export const ArrowUpDown = make(ArrowUpDownIcon, 'lucide-arrow-up-down');
export const BookText = make(BookOpen01Icon, 'lucide-book-text');
export const Bot = make(BotIcon, 'lucide-bot');
export const Box = make(CubeIcon, 'lucide-box');
export const Bug = make(Bug02Icon, 'lucide-bug');
export const Check = make(Tick02Icon, 'lucide-check');
export const CheckCircle = make(CheckmarkCircle02Icon, 'lucide-check-circle');
export const ToastDone = make(NewReleasesIcon, 'lucide-toast-done');
export const ChevronDown = make(ArrowDown01Icon, 'lucide-chevron-down');
export const ChevronRight = make(ArrowRight01Icon, 'lucide-chevron-right');
export const CornerDownRight = make(CornerDownRightIcon, 'lucide-corner-down-right');
export const MousePointerClick = make(CursorMagicSelection04Icon, 'lucide-mouse-pointer-click');
export const MousePointer = make(CursorMagicSelection04Icon, 'lucide-mouse-pointer');
export const Focus = make(CenterFocusIcon, 'lucide-focus');
export const CircleDashed = make(DashedLineCircleIcon, 'lucide-circle-dashed');
export const Copy = make(Copy01Icon, 'lucide-copy');
export const Cross = make(CrossIcon, 'lucide-cross');
export const Crosshair = make(CrosshairIcon, 'lucide-crosshair');
export const Dices = make(DiceIcon, 'lucide-dices');
export const Dna = make(Dna01Icon, 'lucide-dna');
export const Download = make(Download01Icon, 'lucide-download');
export const Drama = make(MaskTheater01Icon, 'lucide-drama');
export const Eraser = make(EraserIcon, 'lucide-eraser');
export const ExternalLink = make(LinkSquare02Icon, 'lucide-external-link');
export const Eye = make(ViewIcon, 'lucide-eye');
export const EyeOff = make(ViewOffSlashIcon, 'lucide-eye-off');
export const FastForward = make(Forward02Icon, 'lucide-fast-forward');
export const FileBox = make(PackageIcon, 'lucide-file-box');
export const ContentLibraryIcon = make(Store03Icon, 'lucide-content-library');
export const FileJson = make(FileCodeIcon, 'lucide-file-json');
export const FingerprintPattern = make(FingerPrintIcon, 'lucide-fingerprint-pattern');
export const Flame = make(Fire02Icon, 'lucide-flame');
export const FlaskConical = make(FlaskConicalIcon, 'lucide-flask-conical');
export const FolderDown = make(FolderDownloadIcon, 'lucide-folder-down');
export const FolderOpen = make(FolderOpenIcon, 'lucide-folder-open');
export const Gamepad2 = make(GameController03Icon, 'lucide-gamepad-2');
export const Gauge = make(DashboardSpeed02Icon, 'lucide-gauge');
export const Ghost = make(Pacman02Icon, 'lucide-ghost');
export const Heart = make(FavouriteIcon, 'lucide-heart');
export const House = make(Home07Icon, 'lucide-house');
export const Image = make(Image01Icon, 'lucide-image');
export const Info = make(InformationCircleIcon, 'lucide-info');
export const Joystick = make(Joystick02Icon, 'lucide-joystick');
export const Keyboard = make(KeyboardIcon, 'lucide-keyboard');
export const Layers = make(Layers01Icon, 'lucide-layers');
export const LayersPlus = make(LayersPlusIcon, 'lucide-layers-plus');
export const Lightbulb = make(Idea01Icon, 'lucide-lightbulb');
export const Link2 = make(Link01Icon, 'lucide-link-2');
export const Link2Off = make(Unlink01Icon, 'lucide-link-2-off');
export const Loader2 = make(Loading03Icon, 'lucide-loader-2');
export const Lock = make(SquareLock02Icon, 'lucide-lock');
export const LogOut = make(Logout01Icon, 'lucide-log-out');
export const Map = make(MapsIcon, 'lucide-map');
export const Megaphone = make(Megaphone02Icon, 'lucide-megaphone');
export const Minus = make(MinusSignIcon, 'lucide-minus');
export const Moon = make(Moon02Icon, 'lucide-moon');
export const Octagon = make(OctagonIcon, 'lucide-octagon');
export const Package = make(PackageIcon, 'lucide-package');
export const PanelRightClose = make(SidebarRight01Icon, 'lucide-panel-right-close');
export const PanelLeft = make(SidebarLeft01Icon, 'lucide-panel-left');
export const Pause = make(PauseIcon, 'lucide-pause');
export const Pentagon = make(PentagonIcon, 'lucide-pentagon');
export const Play = make(PlayIcon, 'lucide-play');
export const Plus = make(PlusSignIcon, 'lucide-plus');
export const Power = make(PowerIcon, 'lucide-power');
export const Rabbit = make(RabbitIcon, 'lucide-rabbit');
export const Redo2 = make(Redo03Icon, 'lucide-redo-2');
export const RotateCcw = make(Undo02Icon, 'lucide-rotate-ccw');
export const RotateCw = make(Redo02Icon, 'lucide-rotate-cw');
export const Search = make(Search01Icon, 'lucide-search');
export const SearchX = make(SearchRemoveIcon, 'lucide-search-x');
export const Settings = make(Settings01Icon, 'lucide-settings');
export const Settings2 = make(Settings05Icon, 'lucide-settings-2');
export const Shapes = make(Shapes01Icon, 'lucide-shapes');
export const Shield = make(Shield01Icon, 'lucide-shield');
export const ShieldAlert = make(ShieldAlertIcon, 'lucide-shield-alert');
export const ShieldOff = make(ShieldOffIcon, 'lucide-shield-off');
export const ShieldPlus = make(ShieldPlusIcon, 'lucide-shield-plus');
export const Shuffle = make(ShuffleIcon, 'lucide-shuffle');
export const SlidersHorizontal = make(SlidersHorizontalIcon, 'lucide-sliders-horizontal');
export const Sprout = make(Plant01Icon, 'lucide-sprout');
export const Square = make(SquareIcon, 'lucide-square');
export const SquareDashed = make(SquareDashedIcon, 'lucide-square-dashed');
export const SquareMenu = make(Menu01Icon, 'lucide-square-menu');
export const Star = make(StarIcon, 'lucide-star');
export const Sun = make(Sun03Icon, 'lucide-sun');
export const Target = make(Target02Icon, 'lucide-target');
export const Trash2 = make(Delete02Icon, 'lucide-trash-2');
export const TriangleAlert = make(Alert02Icon, 'lucide-triangle-alert');
export const Undo = make(Undo02Icon, 'lucide-undo');
export const Undo2 = make(Undo03Icon, 'lucide-undo-2');
export const Upload = make(Upload01Icon, 'lucide-upload');
export const User = make(UserIcon, 'lucide-user');
export const UserCog = make(UserSettings01Icon, 'lucide-user-cog');
export const UserPlus = make(UserAdd01Icon, 'lucide-user-plus');
export const Users = make(UserMultipleIcon, 'lucide-users');
export const WandSparkles = make(MagicWand01Icon, 'lucide-wand-sparkles');
export const Wrench = make(Wrench01Icon, 'lucide-wrench');
export const X = make(Cancel01Icon, 'lucide-x');
export const DoorOpen = make(DoorOpenIcon, 'lucide-door-open');
export const CanvasTool = make(CanvasIcon, 'lucide-canvas');
export const Discord = make(DiscordIcon, 'lucide-discord');
export const Recycle = make(Recycle03Icon, 'lucide-recycle');
export const Globe = make(GlobalIcon, 'lucide-globe');
export const MousePointer2 = make(CursorCircleSelection02Icon, 'lucide-mouse-pointer-2');
export const BrickWall = make(BrickWallIcon, 'lucide-brick-wall');
export const Stone = make(StoneIcon, 'lucide-stone');
export const GolfHole = make(GolfHoleIcon, 'lucide-golf-hole');
export const BlackHole = make(BlackHoleIcon, 'lucide-black-hole');
export const TestTube = make(TestTube01Icon, 'lucide-test-tube');
export const FlipHorizontal = make(DressingTable03Icon, 'lucide-flip-horizontal');
export const Compass = make(Navigation05Icon, 'lucide-compass');
export const Magnet = make(MagnetIcon, 'lucide-magnet');
export const HelpBubble = make(CircleQuestionMarkIcon, 'lucide-help-bubble');
export const EMPTY_LINE = 2;
export const MonitorSmartphone = make(MonitorSmartphoneIcon, 'lucide-monitor-smartphone');
export const XCircle = make(CancelCircleIcon, 'lucide-x-circle');
export const HdDashboardSquareAdd = make(DashboardSquareAddIcon, 'lucide-hd-dashboard-square-add');
export const HdPreferenceHorizontal = make(PreferenceHorizontalIcon, 'lucide-hd-preference-horizontal');
export const HdLayer = make(LayerIcon, 'lucide-hd-layer');
export const HdProfile02 = make(Profile02Icon, 'lucide-hd-profile02');
export const HdGeometricShapes01 = make(GeometricShapes01Icon, 'lucide-hd-geometric-shapes01');
export const HdFingerprintPattern = make(FingerprintPatternIcon, 'lucide-hd-fingerprint-pattern');
export const HdAiBrain01 = make(AiBrain01Icon, 'lucide-hd-ai-brain01');
export const HdAiSparkles = make(AiSparklesIcon, 'lucide-hd-ai-sparkles');
export const HdRectangleCircle = make(RectangleCircleIcon, 'lucide-hd-rectangle-circle');
export const HdDashboardSquareSetting = make(DashboardSquareSettingIcon, 'lucide-hd-dashboard-square-setting');
export const HdArrowAllDirection = make(ArrowAllDirectionIcon, 'lucide-hd-arrow-all-direction');
export const HdPaintBoard = make(PaintBoardIcon, 'lucide-hd-paint-board');
export const HdFileQuestionMark = make(FileQuestionMarkIcon, 'lucide-hd-file-question-mark');
export const HdGun = make(GunIcon, 'lucide-hd-gun');
export const HdAiElements = make(AiElementsIcon, 'lucide-hd-ai-elements');
export const HdAiDrawing = make(AiDrawingIcon, 'lucide-hd-ai-drawing');
export const HdMouseRightClick04 = make(MouseRightClick04Icon, 'lucide-hd-mouse-right-click04');
export const HdGame = make(GameIcon, 'lucide-hd-game');
export const HdAmbulance = make(AmbulanceIcon, 'lucide-hd-ambulance');
export const HdSettingDone01 = make(SettingDone01Icon, 'lucide-hd-setting-done01');
export const HdList = make(ListIcon, 'lucide-hd-list');
export const HdBrainCircuit = make(BrainCircuitIcon, 'lucide-hd-brain-circuit');
export const HdGlobalRefresh = make(GlobalRefreshIcon, 'lucide-hd-global-refresh');
export const HdSphere = make(SphereIcon, 'lucide-hd-sphere');
export const HdFileManagement = make(FileManagementIcon, 'lucide-hd-file-management');
export const HdInboxDownload = make(InboxDownloadIcon, 'lucide-hd-inbox-download');
export const HdLibrary = make(LibraryIcon, 'lucide-hd-library');
export const HdShuffleSquare = make(ShuffleSquareIcon, 'lucide-hd-shuffle-square');
export const HdPaintBrush04 = make(PaintBrush04Icon, 'lucide-hd-paint-brush04');
export const HdArtificialIntelligence07 = make(ArtificialIntelligence07Icon, 'lucide-hd-artificial-intelligence07');
export const HdFileAttachment = make(FileAttachmentIcon, 'lucide-hd-file-attachment');
export const HdAiSwap = make(AiSwapIcon, 'lucide-hd-ai-swap');
export const HdAppWindow = make(AppWindowIcon, 'lucide-hd-app-window');
export const HdImage03 = make(Image03Icon, 'lucide-hd-image03');
export const HdListSetting = make(ListSettingIcon, 'lucide-hd-list-setting');
export const HdDeveloper = make(DeveloperIcon, 'lucide-hd-developer');
export const HdAnalyticsUp = make(AnalyticsUpIcon, 'lucide-hd-analytics-up');
export const HdChart02 = make(Chart02Icon, 'lucide-hd-chart02');
export const HdTestTube03 = make(TestTube03Icon, 'lucide-hd-test-tube03');
export const HdTarget01 = make(Target01Icon, 'lucide-hd-target01');
export const HdDashboardSpeed01 = make(DashboardSpeed01Icon, 'lucide-hd-dashboard-speed01');
export const HdCaduceus = make(CaduceusIcon, 'lucide-hd-caduceus');
export const HdAiCoEditing = make(AiCoEditingIcon, 'lucide-hd-ai-co-editing');
export const HdUserGroup03 = make(UserGroup03Icon, 'lucide-hd-user-group03');
export const HdShapes01 = make(Shapes01Icon, 'lucide-hd-shapes01');
export const HdRabbit = make(RabbitIcon, 'lucide-hd-rabbit');
export const HdAsteroid02 = make(Asteroid02Icon, 'lucide-hd-asteroid02');
export const HdMagicWand03 = make(MagicWand03Icon, 'lucide-hd-magic-wand03');
export const HdEye = make(EyeIcon, 'lucide-hd-eye');
export const HdBomb = make(BombIcon, 'lucide-hd-bomb');
export const HdBlockchain03 = make(Blockchain03Icon, 'lucide-hd-blockchain03');
export const HdColorPicker = make(ColorPickerIcon, 'lucide-hd-color-picker');
export const HdPhysics = make(PhysicsIcon, 'lucide-hd-physics');
export const HdPendulum = make(PendulumIcon, 'lucide-hd-pendulum');
export const HdJoker = make(JokerIcon, 'lucide-hd-joker');
export const HdFileUser = make(FileUserIcon, 'lucide-hd-file-user');
export const HdArtificialIntelligence03 = make(ArtificialIntelligence03Icon, 'lucide-hd-artificial-intelligence03');
export const HdBoxingGlove01 = make(BoxingGlove01Icon, 'lucide-hd-boxing-glove01');
export const HdFingerprintScan = make(FingerPrintScanIcon, 'lucide-hd-fingerprint-scan');
export const HdGlobal = make(GlobalIcon, 'lucide-hd-global');
export const GpuWarning = make(TriangleAlertIcon, 'lucide-gpu-warning');
export const MessageSquareWarning = make(MessageSquareWarningIcon, 'lucide-message-square-warning');
export const HdActivityCircle = make(ActivityCircleIcon, 'lucide-hd-activity-circle');
export const HdRanking = make(RankingIcon, 'lucide-hd-ranking');
export const HdScanEye = make(ScanEyeIcon, 'lucide-hd-scan-eye');

export const Skull = make(SkullIcon, 'lucide-skull');

export const DvShapeHp = make(HealthIcon, 'lucide-dv-shape-hp');
export const DvProjectileHp = make(BulletIcon, 'lucide-dv-projectile-hp');
export const DvXpGain = make(SparklesIcon, 'lucide-dv-xp-gain');
export const DvShowAllMinimap = make(RadarIcon, 'lucide-dv-show-all-minimap');
export const DvShowAllNames = make(LabelIcon, 'lucide-dv-show-all-names');
export const DvEntityCounts = make(HashtagIcon, 'lucide-dv-entity-counts');
export const DvFrameTimings = make(StopWatchIcon, 'lucide-dv-frame-timings');
export const DvJitter = make(Activity01Icon, 'lucide-dv-jitter');
export const DvMemory = make(RamMemoryIcon, 'lucide-dv-memory');
export const DvDrawOps = make(Layers01Icon, 'lucide-dv-draw-ops');
export const DvNanRepairs = make(BandageIcon, 'lucide-dv-nan-repairs');
export const DvLoopErrors = make(Bug01Icon, 'lucide-dv-loop-errors');
export const DvStateLabel = make(Tag01Icon, 'lucide-dv-state-label');
export const DvRoleReadout = make(UserStarIcon, 'lucide-dv-role-readout');
export const DvAimLaser = make(CrosshairIcon, 'lucide-dv-aim-laser');
export const DvTargetLine = make(Target01Icon, 'lucide-dv-target-line');
export const DvFollowMarker = make(Location01Icon, 'lucide-dv-follow-marker');
export const DvThreatResponse = make(DangerIcon, 'lucide-dv-threat-response');
export const DvOrbitRing = make(Orbit01Icon, 'lucide-dv-orbit-ring');
export const DvFearMeter = make(Sad01Icon, 'lucide-dv-fear-meter');
export const DvNavigationDebug = make(WaypointsIcon, 'lucide-dv-navigation-debug');
export const DvWallShots = make(BrickWallFireIcon, 'lucide-dv-wall-shots');
export const DvCornerAim = make(CornerUpRightIcon, 'lucide-dv-corner-aim');
export const DvAimSelfMotion = make(ArrowMoveUpRightIcon, 'lucide-dv-aim-self-motion');
export const DvAimTruth = make(SnailIcon, 'lucide-dv-aim-truth');
export const DvAimGodly = make(CrownIcon, 'lucide-dv-aim-godly');
export const DvPlayerHunt = make(BowArrowIcon, 'lucide-dv-player-hunt');
export const DvDroneCloud = make(DroneIcon, 'lucide-dv-drone-cloud');
export const DvChaseRange = make(RadiusIcon, 'lucide-dv-chase-range');
export const DvFarmAim = make(PentagonIcon, 'lucide-dv-farm-aim');
export const DvCornerFire = make(FireIcon, 'lucide-dv-corner-fire');
export const DvGunMountAim = make(GunIcon, 'lucide-dv-gun-mount-aim');
export const DvCornerStand = make(AnchorIcon, 'lucide-dv-corner-stand');
export const DvCornerSidestep = make(FootprintsIcon, 'lucide-dv-corner-sidestep');
export const DvGhostMode = make(Pacman02Icon, 'lucide-dv-ghost-mode');
export const DvPathBlocked = make(RouteBlockIcon, 'lucide-dv-path-blocked');
export const DvChaseGivenUp = make(FlagOffIcon, 'lucide-dv-chase-given-up');
export const DvGunRangeStandoff = make(RulerDimensionLineIcon, 'lucide-dv-gun-range-standoff');
export const DvStandAside = make(UserArrowLeftRightIcon, 'lucide-dv-stand-aside');
export const DvShotBack = make(BoxingGloveIcon, 'lucide-dv-shot-back');
export const DvShieldHits = make(ShieldEnergyIcon, 'lucide-dv-shield-hits');
export const DvAimReaction = make(TimeQuarterIcon, 'lucide-dv-aim-reaction');
export const DvAimError = make(Angle01Icon, 'lucide-dv-aim-error');
export const DvHuntedFlee = make(BinocularsIcon, 'lucide-dv-hunted-flee');
export const DvFleeReroute = make(ArrowTurnBackwardIcon, 'lucide-dv-flee-reroute');
export const DvDeadEndEscape = make(MazeIcon, 'lucide-dv-dead-end-escape');
export const DvFearRearm = make(HourglassIcon, 'lucide-dv-fear-rearm');
export const DvFleeStand = make(SwordsIcon, 'lucide-dv-flee-stand');
export const DvFleeCommit = make(RunningShoesIcon, 'lucide-dv-flee-commit');
export const DvBorderSqueeze = make(SquareArrowShrink01Icon, 'lucide-dv-border-squeeze');
export const DvRoleRepairs = make(RepairIcon, 'lucide-dv-role-repairs');
export const DvOverlayCost = make(CpuIcon, 'lucide-dv-overlay-cost');
export const DvSpawnStats = make(ChartColumnIcon, 'lucide-dv-spawn-stats');
export const DvRarityWarning = make(DiamondIcon, 'lucide-dv-rarity-warning');
export const SourceCode = make(SourceCodeIcon, 'lucide-source-code');
export const Tag = make(Tag01Icon, 'lucide-tag');

export const GameEngine = make(TestTube01Icon, 'lucide-game-engine');
import { LaptopSettingsIcon } from '@hugeicons/core-free-icons';
export const Sandbox = make(LaptopSettingsIcon, 'lucide-sandbox');
import {
  UndoIcon, TransactionHistoryIcon, FlagIcon, FolderAddIcon, Folder01Icon, FolderRemoveIcon, PencilEdit02Icon,
  Scissor01Icon, ClipboardIcon, TextSelectionIcon, CrownIcon as CrownIcon2, TagsIcon,
} from '@hugeicons/core-free-icons';
export const UndoStep = make(UndoIcon, 'lucide-undo-step');
export const HdHistory = make(TransactionHistoryIcon, 'lucide-history');
export const Flag = make(FlagIcon, 'lucide-flag');
export const FolderPlus = make(FolderAddIcon, 'lucide-folder-plus');
export const Folder = make(Folder01Icon, 'lucide-folder');
export const FolderMinus = make(FolderRemoveIcon, 'lucide-folder-minus');
export const Pencil = make(PencilEdit02Icon, 'lucide-pencil');
export const Scissors = make(Scissor01Icon, 'lucide-scissors');
export const ClipboardPaste = make(ClipboardIcon, 'lucide-clipboard-paste');
export const TextSelect = make(TextSelectionIcon, 'lucide-text-select');
export const Crown = make(CrownIcon2, 'lucide-crown');
export const Tags = make(TagsIcon, 'lucide-tags');

import {
  FileBoxIcon, FileImageIcon, FloppyDiskIcon, FileImportIcon, FileExportIcon, ArchiveArrowDownIcon, MoreHorizontalIcon,
  FullScreenIcon, FileAddIcon, ArchiveRestoreIcon, SaveAllIcon, ShieldQuestionMarkIcon, BadgeInfoIcon,
} from '@hugeicons/core-free-icons';
export const BadgeInfo = make(BadgeInfoIcon, 'lucide-badge-info');
export const ShieldQuestion = make(ShieldQuestionMarkIcon, 'lucide-shield-question');
export const HdFileBox = make(FileBoxIcon, 'lucide-hd-file-box');
export const HdMapFile = make(FileImageIcon, 'lucide-hd-map-file');
export const Save = make(FloppyDiskIcon, 'lucide-save');
export const SaveAs = make(SaveAllIcon, 'lucide-save-as');
export const FileImport = make(FileImportIcon, 'lucide-file-import');
export const FileExport = make(FileExportIcon, 'lucide-file-export');
export const BackupAll = make(ArchiveArrowDownIcon, 'lucide-backup-all');
export const MoreHorizontal = make(MoreHorizontalIcon, 'lucide-more-horizontal');
export const FullScreen = make(FullScreenIcon, 'lucide-full-screen');
export const FileNew = make(FileAddIcon, 'lucide-file-new');
export const RestoreItem = make(ArchiveRestoreIcon, 'lucide-restore-item');

import { TimelineEventIcon, ArrangeIcon, Calendar02Icon, TrafficLightIcon, CursorRectangleSelection01Icon, SunCloudHailstone01Icon, Timer01Icon, ComputerActivityIcon, SettingError03Icon } from '@hugeicons/core-free-icons';
export const MevEvents = make(TimelineEventIcon, 'lucide-mev-events');
export const MevSequences = make(ArrangeIcon, 'lucide-mev-sequences');
export const MevWaves = make(Calendar02Icon, 'lucide-mev-waves');
export const MevTypes = make(FingerPrintIcon, 'lucide-mev-types');
export const MevEntities = make(TrafficLightIcon, 'lucide-mev-entities');
export const MevAreas = make(CursorRectangleSelection01Icon, 'lucide-mev-areas');
export const MevVars = make(SunCloudHailstone01Icon, 'lucide-mev-vars');
export const MevTimers = make(Timer01Icon, 'lucide-mev-timers');
export const MevStatuses = make(ComputerActivityIcon, 'lucide-mev-statuses');
export const MevProblems = make(SettingError03Icon, 'lucide-mev-problems');

import { CircleIcon, HexagonIcon, PenTool01Icon } from '@hugeicons/core-free-icons';
export const AreaEllipse = make(CircleIcon, 'lucide-area-ellipse');
export const AreaPolygon = make(HexagonIcon, 'lucide-area-polygon');
export const AreaFree = make(PenTool01Icon, 'lucide-area-free');

import { AuctionIcon } from '@hugeicons/core-free-icons';
export const LegalTerms = make(AuctionIcon, 'lucide-legal-terms');

import { Github01Icon, FileScriptIcon, File01Icon, ArrowDown02Icon, DashboardSquare01Icon } from '@hugeicons/core-free-icons';
export const Github = make(Github01Icon, 'lucide-github');
export const FileScript = make(FileScriptIcon, 'lucide-file-script');
export const FilePlain = make(File01Icon, 'lucide-file-plain');
export const ArrowDown = make(ArrowDown02Icon, 'lucide-arrow-down');
export const Overview = make(DashboardSquare01Icon, 'lucide-overview');
