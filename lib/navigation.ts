import type { IconType } from "react-icons";
import { FiHome, FiSettings } from "react-icons/fi";

export type NavigationItem = {
  disabled?: boolean;
  href: string;
  icon?: IconType;
  label: string;
};

export const appNavigation: NavigationItem[] = [
  {
    href: "/dashboard",
    icon: FiHome,
    label: "Dashboard",
  },
  {
    href: "/settings",
    icon: FiSettings,
    label: "Settings",
  },
];
