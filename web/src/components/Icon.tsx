// One icon set — lucide — behind a name, so callers do not import thirty symbols
// each and the workshop can list them. Icons are never the interactive element:
// a `Button`/`ActionIcon` owns the click, this only draws.

import {
  ArrowLeft,
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
  Moon,
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
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'arrow-left'
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
  | 'search';

export const ICON_NAMES: IconName[] = [
  'arrow-left',
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
];

const ICONS = {
  'arrow-left': ArrowLeft,
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
