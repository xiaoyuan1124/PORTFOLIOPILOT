import { AppShell } from "@/components/app-shell";
import { NativeRuntimeBridge } from "@/components/native-runtime-bridge";

export default function HomePage() {
  return (
    <>
      <NativeRuntimeBridge />
      <AppShell />
    </>
  );
}
