"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { MOCK_COMPANY } from "@/lib/ui-mocks";

export default function CompanySettingsPage() {
  const [form, setForm] = useState(MOCK_COMPANY);
  const [msg, setMsg] = useState("");

  function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg("Настройки компании сохранены");
  }

  return (
    <ModuleWorkspace
      title="Компания"
      subtitle="Профиль сети AROMAT PLUS"
      tabs={[
        { id: "company", label: "Компания", href: "/settings/company" },
        { id: "hub", label: "Все настройки", href: "/settings" },
        { id: "refs", label: "Справочники", href: "/settings/references" },
        { id: "password", label: "Пароль", href: "/settings/password" },
      ]}
      activeTab="company"
    >
      <ModuleSection
        title="Основные данные"
        action={
          <Link href="/settings" className="text-sm font-semibold text-brand">
            ← Настройки
          </Link>
        }
      >
        <Card className="max-w-xl p-5">
          <form onSubmit={onSave} className="space-y-3">
            {(
              [
                ["name", "Название"],
                ["legalName", "Юридическое название"],
                ["phone", "Телефон"],
                ["email", "Email"],
                ["address", "Адрес"],
                ["currency", "Валюта"],
                ["timezone", "Часовой пояс"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
            {msg ? <p className="text-sm text-success">{msg}</p> : null}
            <Button type="submit" fullWidth={false}>
              Сохранить
            </Button>
          </form>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
