// One icon set — lucide, the set shadcn uses — behind a name so the workshop can
// list them and callers do not import thirty symbols each.

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
  | 'loader';

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
} satisfies Record<IconName, LucideIcon>;

export function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const Component = ICONS[name];
  return <Component className={className} aria-hidden="true" />;
}
