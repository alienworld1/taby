import type { IconType } from "react-icons";
import { FiHome, FiPlusCircle, FiSettings } from "react-icons/fi";

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
    disabled: true,
    href: "/dashboard",
    icon: FiPlusCircle,
    label: "Create",
  },
  {
    href: "/settings",
    icon: FiSettings,
    label: "Settings",
  },
];
