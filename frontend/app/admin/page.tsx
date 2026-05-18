'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Report = {
  id: number;
  created_at: string;
  reporter_email: string;
  reason: string;
};

type BannedUser = {
  id: number;
  created_at: string;
  email: string;
  reason: string;
  banned_until: string | null;
};

export default function AdminPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const reportsResult = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });

    const bannedResult = await supabase
      .from('banned_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (reportsResult.data) {
      setReports(reportsResult.data);
    }

    if (bannedResult.data) {
      setBannedUsers(bannedResult.data);
    }

    setLoading(false);
  };

  const banEmail = async (email: string, reason: string) => {
    if (!email) return;

    const confirmBan = confirm(`¿Banear a ${email}?`);

    if (!confirmBan) return;

    await supabase.from('banned_users').upsert({
      email,
      reason: reason || 'Reporte de usuario',
      banned_until: null,
    });

    alert('Usuario baneado.');
    loadData();
  };

  const unbanEmail = async (email: string) => {
    const confirmUnban = confirm(`¿Quitar ban a ${email}?`);

    if (!confirmUnban) return;

    await supabase
      .from('banned_users')
      .delete()
      .eq('email', email);

    alert('Usuario desbloqueado.');
    loadData();
  };

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            Panel de Moderación
          </h1>

          <button
            onClick={loadData}
            className="px-4 py-2 rounded-xl bg-white text-black font-medium"
          >
            Recargar
          </button>
        </div>

        {loading ? (
          <div className="text-white/60">
            Cargando datos...
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-xl font-semibold mb-4">
                Usuarios baneados
              </h2>

              {bannedUsers.length === 0 ? (
                <div className="text-white/50">
                  No hay usuarios baneados.
                </div>
              ) : (
                <div className="space-y-3">
                  {bannedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-red-300">
                          {user.email}
                        </div>

                        <div className="text-sm text-white/50">
                          {user.reason}
                        </div>
                      </div>

                      <button
                        onClick={() => unbanEmail(user.email)}
                        className="px-4 py-2 rounded-xl bg-white text-black font-medium"
                      >
                        Quitar ban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4">
                Reportes
              </h2>

              {reports.length === 0 ? (
                <div className="text-white/50">
                  No hay reportes todavía.
                </div>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="bg-white/5 border border-white/10 rounded-2xl p-5"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <div className="font-semibold">
                            {report.reporter_email}
                          </div>

                          <div className="text-sm text-white/40">
                            {new Date(report.created_at).toLocaleString()}
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            banEmail(report.reporter_email, report.reason)
                          }
                          className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 font-medium"
                        >
                          Banear email
                        </button>
                      </div>

                      <div className="mt-4 text-white/80">
                        {report.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}