import template1 from '../templates/banner/template1.html'
import template2 from '../templates/banner/template2.html'
import template3 from '../templates/banner/template3.html'
import template4 from '../templates/banner/template4.html'
import template5 from '../templates/banner/template5.html'
import template6 from '../templates/banner/template6.html'
import template7 from '../templates/banner/template7.html'
import template8 from '../templates/banner/template8.html'
import template9 from '../templates/banner/template9.html'
import template10 from '../templates/banner/template10.html'
import template11 from '../templates/banner/template11.html'
import template12 from '../templates/banner/template12.html'
import v_template1 from '../templates/banner/v_template1.html'

export interface BannerTemplate {
  id: string
  name: string
  description: string
  template: string
}

export const bannerTemplates: BannerTemplate[] = [
  {
    id: 'template1',
    name: 'Classic Banner',
    description: 'A classic banner with gradient overlay and footer',
    template: template1
  },
  {
    id: 'template2',
    name: 'Modern Dark',
    description: 'A modern banner with dark overlay and centered content',
    template: template2
  },
  {
    id: 'template3',
    name: 'Side Layout',
    description: 'A minimal banner with side-by-side layout',
    template: template3
  },
  {
    id: 'template4',
    name: 'Card Style',
    description: 'A modern card-style banner with floating content box',
    template: template4
  },
  {
    id: 'template5',
    name: 'Bottom Aligned',
    description: 'A minimalist banner with bottom-aligned content',
    template: template5
  },
  {
    id: 'template6',
    name: 'Diagonal Split',
    description: 'A creative banner with diagonal split and floating shapes',
    template: template6
  },
  {
    id: 'template7',
    name: 'Circular Modern',
    description: 'A modern design with circular elements and radial layout',
    template: template7
  },
  {
    id: 'template8',
    name: 'Grid Layout',
    description: 'A modern grid-based layout with creative sections',
    template: template8
  },
  {
    id: 'template9',
    name: 'Wave Design',
    description: 'A dynamic banner with wave patterns and floating elements',
    template: template9
  },
  {
    id: 'template10',
    name: 'Gradient Mesh',
    description: 'A geometric banner with gradient mesh and modern accents',
    template: template10
  },
  {
    id: 'template11',
    name: '3D Perspective',
    description: 'A modern banner with 3D depth effects and layered elements',
    template: template11
  },
  {
    id: 'template12',
    name: 'Neon Glow',
    description: 'A vibrant banner with neon lighting effects and dark theme',
    template: template12
  },
  {
    id: 'v_template1',
    name: 'Video Template',
    description: 'A video template with a white gradient overlay',
    template: v_template1
  }
]

export function getTemplate(templateId: string): BannerTemplate | undefined {
  return bannerTemplates.find(t => t.id === templateId)
}

export function renderTemplate(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key]?.toString() || ''
  })
}