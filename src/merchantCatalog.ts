import type { MovementCategory } from './mockData';

export type MerchantPresentation = {
  name: string;
  icon: string;
  color: string;
  category?: MovementCategory;
};

const merchants: Array<{ terms: string[]; presentation: MerchantPresentation }> = [
  { terms: ['uber'], presentation: { name: 'Uber', icon: 'car-outline', color: '#111111', category: 'Transporte' } },
  { terms: ['99 ', '99app'], presentation: { name: '99', icon: 'car-outline', color: '#FFD84D', category: 'Transporte' } },
  { terms: ['ifood'], presentation: { name: 'iFood', icon: 'restaurant-outline', color: '#EF4444', category: 'Alimentacao' } },
  { terms: ['mercado livre'], presentation: { name: 'Mercado Livre', icon: 'bag-outline', color: '#FFD84D' } },
  { terms: ['shopee'], presentation: { name: 'Shopee', icon: 'bag-outline', color: '#FF8A00' } },
  { terms: ['netflix'], presentation: { name: 'Netflix', icon: 'play-outline', color: '#EF4444', category: 'Assinaturas' } },
  { terms: ['spotify'], presentation: { name: 'Spotify', icon: 'musical-notes-outline', color: '#21C45A', category: 'Assinaturas' } },
  { terms: ['canva'], presentation: { name: 'Canva', icon: 'color-palette-outline', color: '#5B8CFF', category: 'Trabalho' } },
];

export function getMerchantPresentation(title: string): MerchantPresentation | null {
  const normalized = ` ${title.toLocaleLowerCase('pt-BR')} `;
  return merchants.find((merchant) => merchant.terms.some((term) => normalized.includes(term)))?.presentation ?? null;
}

export function getSuggestedMerchantCategory(title: string, availableCategories: string[]): MovementCategory | null {
  const category = getMerchantPresentation(title)?.category;
  return category && availableCategories.includes(category) ? category : null;
}
