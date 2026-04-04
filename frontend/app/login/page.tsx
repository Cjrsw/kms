import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "../../components/login-form";
import { getCurrentUser } from "../../lib/auth";
import { AUTH_COOKIE_NAME } from "../../lib/config";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    debug?: string;
  }>;
};

function getErrorMessage(error?: string) {
  if (error === "required") {
    return "Please enter both username and password.";
  }

  if (error === "invalid") {
    return "Invalid username or password.";
  }

  return "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const debugMode = resolvedSearchParams?.debug === "1";
  const headerStore = debugMode ? await headers() : null;
  const cookieStore = debugMode ? await cookies() : null;
  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect("/repositories");
  }

  const errorMessage = getErrorMessage(resolvedSearchParams?.error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F7FA] px-4 font-sans">
      <div className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/20 shadow-inner backdrop-blur-sm">
            <span className="text-3xl font-bold text-white">K</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Zhiku KMS</h1>
          <p className="mt-2 text-sm font-medium tracking-wide text-blue-100/80">
            Enterprise knowledge management and collaboration
          </p>
        </div>

        <div className="p-8">
          <LoginForm initialErrorMessage={errorMessage} />

          {debugMode ? (
            <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs leading-6 text-gray-600">
              <p>debug cookie header: {headerStore?.get("cookie") ? "present" : "missing"}</p>
              <p>debug expected cookie: {AUTH_COOKIE_NAME}</p>
              <p>
                debug all cookie names: {cookieStore?.getAll().map((item) => item.name).join(", ") || "(none)"}
              </p>
              <p>debug cookie found: {cookieStore?.get(AUTH_COOKIE_NAME) ? "yes" : "no"}</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
