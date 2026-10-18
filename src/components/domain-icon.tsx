import { Bot, Brain, Building, Code, Cpu, Factory, Layers, Network, Radio, Server, Settings, Shield, Sun, Wrench, Zap, type LucideIcon } from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  code: Code, layers: Layers, network: Network, shield: Shield, server: Server, brain: Brain, cpu: Cpu, zap: Zap,
  settings: Settings, bot: Bot, radio: Radio, building: Building, wrench: Wrench, sun: Sun, factory: Factory,
};

export function DomainIcon({ name, className }: { name: string; className?: string }) {
  const C = MAP[name] ?? Cpu;
  return <C className={className} aria-hidden />;
}
