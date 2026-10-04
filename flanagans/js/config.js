// Single source of truth for the 3D model and the restaurant links.
//
// To swap the procedural burger for a real scanned/modelled one, export a
// GLB whose layer nodes are named `layer_<name>` (e.g. layer_bun_top,
// layer_cheese, layer_patty…), drop it in assets/models/ and set:
//
//   HERO_MODEL = { type: 'glb', url: 'assets/models/burger.glb',
//                  labels: { bun_top: 'Pan brioche', patty: 'Carne', … } }
//
// Layer order is read from each node's height, so the explode, labels and
// physics keep working without touching any other file.
export const HERO_MODEL = { type: 'procedural', recipe: 'anatomia' };

export const LINKS = {
  reservas: 'https://flanagansburguer.com/reservas-2/',
  carta: 'https://flanagansburguer.com/carta-2/',
  instagram: 'https://www.instagram.com/flanagansburguer/',
  uber: 'https://www.ubereats.com/es/store/flanagans/UHY2X4X9VOiBtL8SPRf_iw',
  justeat: 'https://www.just-eat.es/restaurants-flanagans-burger-mostoles/menu',
  phone: 'tel:+34919401241',
  maps: 'https://www.google.com/maps/search/?api=1&query=Flanagans+Burguer+Calle+Casiopea+12+M%C3%B3stoles',
};

export const HERO_NAMES = {
  anatomia: 'Anatomía de una burger',
  smash: 'Flanagan’s Smash',
  mostoles: 'Móstoles Style',
  pulledpork: 'Pulled Pork',
  vegan: 'Vegan Burger',
};

// Real photography slots. Leave empty to use the in-browser 3D renders.
// e.g. burgers: { smash: 'assets/photos/smash.jpg' }
//      local:   ['assets/photos/local-1.jpg', 'assets/photos/local-2.jpg', 'assets/photos/local-3.jpg']
export const PHOTOS = {
  burgers: {},
  local: [],
};
