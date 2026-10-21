// One icon set — lucide — behind a name, so callers do not import thirty symbols
// each and the workshop can list them. Icons are never the interactive element:
// a `Button`/`ActionIcon` owns the click, this only draws.

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Columns2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Image,
  LayoutGrid,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Moon,
  MoreVertical,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Rows2,
  Search,
  Send,
  Sparkles,
  Square,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'send'
  | 'stop'
  | 'copy'
  | 'check'
  | 'refresh'
  | 'plus'
  | 'pencil'
  | 'eye'
  | 'columns'
  | 'rows'
  | 'grid'
  | 'terminal'
  | 'x'
  | 'external'
  | 'chevron-down'
  | 'sparkles'
  | 'sun'
  | 'moon'
  | 'panel-right'
  | 'image'
  | 'alert'
  | 'clock'
  | 'file'
  | 'loader'
  | 'search'
  | 'more'
  | 'trash'
  | 'maximize'
  | 'minimize';

export const ICON_NAMES: IconName[] = [
  'arrow-left',
  'arrow-right',
  'send',
  'stop',
  'copy',
  'check',
  'refresh',
  'plus',
  'pencil',
  'eye',
  'columns',
  'rows',
  'grid',
  'terminal',
  'x',
  'external',
  'chevron-down',
  'sparkles',
  'sun',
  'moon',
  'panel-right',
  'image',
  'alert',
  'clock',
  'file',
  'loader',
  'search',
  'more',
  'trash',
  'maximize',
  'minimize',
];

const ICONS = {
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  send: Send,
  stop: Square,
  copy: Copy,
  check: Check,
  refresh: RefreshCw,
  plus: Plus,
  pencil: Pencil,
  eye: Eye,
  columns: Columns2,
  rows: Rows2,
  grid: LayoutGrid,
  terminal: Terminal,
  x: X,
  external: ExternalLink,
  'chevron-down': ChevronDown,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  'panel-right': PanelRight,
  image: Image,
  alert: TriangleAlert,
  clock: Clock,
  file: FileText,
  loader: LoaderCircle,
  search: Search,
  more: MoreVertical,
  trash: Trash2,
  maximize: Maximize2,
  minimize: Minimize2,
} satisfies Record<IconName, LucideIcon>;

export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Component = ICONS[name];
  return <Component size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
