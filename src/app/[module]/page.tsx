import Link from "next/link";
import { notFound } from "next/navigation";
import { navigation } from "@/components/omnilock/navigation";
import { Icon } from "@/components/omnilock/icons";

// Explicit routes added by teammates take precedence over this placeholder.
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const item = navigation.find(entry => entry.slug === module && entry.slug !== "");
  if (!item) notFound();
  const teammateModule = ["customers", "categories"].includes(module);
  return <><div className="page-heading"><div><p className="eyebrow">OMNILOCK WORKSPACE</p><h1>{item.label}</h1><p>Your {item.label.toLowerCase()} workspace.</p></div></div><section className="placeholder-panel"><span className="placeholder-icon"><Icon name={item.icon} /></span><span className="badge blue">Coming soon</span><h2>{item.label} module is under development</h2><p>{teammateModule ? "This module is reserved for Tarun’s implementation on tarun-core. This shared placeholder will give way to the dedicated module when it is integrated." : `The ${item.label.toLowerCase()} interface has not been implemented yet. View current inventory and order activity on the dashboard.`}</p><Link className="button primary" href="/">Back to dashboard <Icon name="arrow" /></Link></section></>;
}
