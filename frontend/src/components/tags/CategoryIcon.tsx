import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  FlagIcon,
  GraduationCapIcon,
  HeartIcon,
  LanguageIcon,
  MapPinIcon,
  TagIcon,
  UsersIcon,
} from '../Icons';

const ICONS: Record<string, typeof TagIcon> = {
  calendar: CalendarIcon,
  graduation: GraduationCapIcon,
  building: BuildingIcon,
  briefcase: BriefcaseIcon,
  heart: HeartIcon,
  pin: MapPinIcon,
  flag: FlagIcon,
  language: LanguageIcon,
  people: UsersIcon,
};

export const CategoryIcon = ({ icon, size, color }: { icon: string | null | undefined; size: number; color?: string }) => {
  const Icon = (icon && ICONS[icon]) || TagIcon;
  return <Icon size={size} color={color} style={{ flexShrink: 0 }} aria-hidden="true" />;
};
