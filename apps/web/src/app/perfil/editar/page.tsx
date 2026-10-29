import type { MeDto } from "@red/api-types";
import { EditProfileForm } from "@/components/edit-profile-form";
import { apiFetchServer } from "@/lib/api-server";

async function getMe(): Promise<MeDto> {
  return apiFetchServer<MeDto>("/api/auth/me");
}

export default async function EditarPerfilPage() {
  const me = await getMe();

  return (
    <main className="mx-auto max-w-sm px-4 py-6">
      <h1 className="text-2xl font-bold">Editar perfil</h1>
      <EditProfileForm me={me} />
    </main>
  );
}
