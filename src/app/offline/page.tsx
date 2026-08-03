import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0f1419] px-6 text-center text-white">
      <h1 className="text-xl font-semibold">Aramat</h1>
      <p className="max-w-sm text-sm text-white/70">
        Нет соединения. Показаны последние сохранённые данные после возврата в
        приложение. После восстановления связи информация обновится
        автоматически.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white"
      >
        Повторить
      </Link>
    </main>
  );
}
