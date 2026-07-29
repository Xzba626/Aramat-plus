import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";

const SETTINGS_CARDS = [
  {
    href: "/settings/password",
    title: "Пароль и вход",
    description: "Смена пароля владельца и доступ к аккаунту.",
  },
  {
    href: "/settings/references",
    title: "Справочники",
    description: "Единицы измерения, типы операций, типы расходов.",
  },
  {
    href: "/users",
    title: "Роли и пользователи",
    description: "Owner · Manager · Seller. Выдача логина и пароля.",
  },
  {
    href: "/notifications",
    title: "Уведомления",
    description: "Какие события показывать владельцу и менеджеру.",
  },
  {
    href: "/settings/company",
    title: "Компания",
    description: "Название, контакты и параметры сети AROMAT PLUS.",
  },
];

export default function SettingsPage() {
  return (
    <ModuleWorkspace
      title="Настройки"
      subtitle="Владелец управляет доступом, справочниками и параметрами компании"
    >
      <ModuleSection title="Разделы">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SETTINGS_CARDS.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card className="h-full p-5 transition hover:border-brand/30">
                <div className="text-sm font-bold text-ink">{card.title}</div>
                <p className="mt-2 text-sm text-muted">{card.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
