import MobileShell from "../../components/MobileShell";

export default async function Page({ params }: { params: Promise<{ route_id: string }> }) {
  const { route_id } = await params;
  return <MobileShell initialTab="map" initialRoute={route_id} />;
}
