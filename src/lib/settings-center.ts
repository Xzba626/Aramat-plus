import { Role } from "@prisma/client";

/**
 * Settings Center sections — hub cards on /settings.
 * Left nav stays a single link; depth lives inside the center.
 */
export type SettingsSectionId =
  | "company"
  | "profile"
  | "security"
  | "notifications"
  | "system";

export type SettingsSection = {
  id: SettingsSectionId;
  href: string;
  titleKey: string;
  descKey: string;
  /** Who sees the card */
  roles: Role[];
  danger?: boolean;
};

export const SETTINGS_CENTER_SECTIONS: SettingsSection[] = [
  {
    id: "company",
    href: "/settings/company",
    titleKey: "settingsCenter.company",
    descKey: "settingsCenter.companyDesc",
    roles: [Role.OWNER, Role.ADMIN, Role.MANAGER],
  },
  {
    id: "profile",
    href: "/settings/profile",
    titleKey: "settingsCenter.profile",
    descKey: "settingsCenter.profileDesc",
    roles: [Role.OWNER, Role.ADMIN, Role.MANAGER],
  },
  {
    id: "security",
    href: "/settings/security",
    titleKey: "settingsCenter.security",
    descKey: "settingsCenter.securityDesc",
    roles: [Role.OWNER, Role.ADMIN, Role.MANAGER],
  },
  {
    id: "notifications",
    href: "/settings/notifications",
    titleKey: "settingsCenter.notifications",
    descKey: "settingsCenter.notificationsDesc",
    roles: [Role.OWNER, Role.ADMIN, Role.MANAGER],
  },
  {
    id: "system",
    href: "/settings/system",
    titleKey: "settingsCenter.system",
    descKey: "settingsCenter.systemDesc",
    roles: [Role.OWNER],
    danger: true,
  },
];

export function settingsSectionsForRole(role: Role): SettingsSection[] {
  return SETTINGS_CENTER_SECTIONS.filter((s) => s.roles.includes(role));
}
