export interface CharacterRead {
  id: string;
  name: string;
  description: string;
  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  attackRange: number;
  tempApPerTurn: number;
  speed: number;
  critRate: number;
  luck: number;
  rarity: import('./skill').Rarity;
  skillPointCapacity: number;
  portraitImageUrl: string | null;
  tokenImageUrl: string | null;
  defaultSkillTemplateIds: string[];
}

export interface CharacterCreate extends Omit<CharacterRead, 'id'> {
  id?: string;
}

export interface CharacterUpdate extends Omit<CharacterRead, 'id'> {}
