export interface EffectConfig {
  type: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

export interface SkillTemplateRead {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  skillKind: 'built_in' | 'configurable';
  enabled: boolean;
  usableAs: ('character' | 'common' | 'reward' | 'summon')[];
  category: 'character' | 'common';
  cost: number;
  range: number;
  targetType: string;
  areaType: string;
  canTargetSelf: boolean;
  canTargetAlly: boolean;
  canTargetEnemy: boolean;
  canTargetEmptyCell: boolean;
  effects: EffectConfig[];
}

export interface SkillTemplateWrite extends Omit<SkillTemplateRead, 'id' | 'skillKind'> {
  id?: string;
  skillKind?: 'built_in' | 'configurable';
}
