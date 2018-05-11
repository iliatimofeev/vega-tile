import {ingest, Transform} from 'vega-dataflow';
import {inherits} from 'vega-util';

var DEFAULT_TILE_URL = 'http://tile.stamen.com/toner-lite/';
var BASE_TILE_SIZE = 256;

export default function Tile(params) {
  Transform.call(this, null, params);
}

Tile.Definition = {
  "type": "Tile",
  "metadata": {"changes": true},
  "params": [
    { "name": "projection", "type": "projection", "required": true },
    { "name": "size", "type": "number", "array": true, "length": 2, "required": true },
    { "name": "url", "type": "string" }
  ]
};

var prototype = inherits(Tile, Transform);

// TRANSFORMATIONS IN PROOF OF CONCEPT
// {"type": "sequence", "start": 0, "stop": {"signal": "maxTiles"}},
// {"type": "cross", "filter": "(datum.a.data>=0)&(datum.b.data>=0)"},
// {
//   "type": "formula",
//   "as": "url",
//   "expr": "tileUrl+zoom+'/'+(datum.a.data+di+tilesCount)%tilesCount+ '/'+((datum.b.data+dj))+'.png'"
// },
// {"type": "formula", "as": "x", "expr": "datum.a.data*tileSize + dx"},
// {"type": "formula", "as": "y", "expr": "datum.b.data*tileSize + dy"}

prototype.transform = function(_, pulse) {
  var out = pulse.fork(pulse.NO_SOURCE | pulse.NO_FIELDS),
      projection = _.projection,
      origin = projection.invert([0, 0]),
      scale = projection.scale(),
      size = _.size,
      tileURL = _.url || DEFAULT_TILE_URL;

  // throw error if projection not type mercator

  // scale  / (2 * Math.PI) = BASE_TILE_SIZE * pow(2,zoom_precise)
  var zoomPrecise = Math.log((scale * 2 * Math.PI) / BASE_TILE_SIZE) * Math.LOG2E,
      zoom = Math.ceil(zoomPrecise),
      tileCount = Math.pow(2, zoom),
      tileSize = BASE_TILE_SIZE * Math.pow(2, zoomPrecise - zoom),
      dii = tileCount * (origin[0] + 180) / 360,
      di = Math.floor(dii),
      dx = Math.round((di - dii) * tileSize),
      djj = tileCount * (1 - Math.log(Math.tan(origin[1] * Math.PI/180) + 1/Math.cos(origin[1] * Math.PI/180)) / Math.PI) / 2,
      dj = Math.floor(djj),
      dy = Math.round((dj - djj) * tileSize);

  function tile(u, v) {
    var x = (u + di + tileCount) % tileCount,
        y = (v + dj);
    return ingest({
      url:    tileURL + zoom + '/' + x + '/' + y + '.png',
      x:      u * tileSize + dx,
      y:      v * tileSize + dy,
      size:   tileSize
    });
  }

  var maxTilesX = Math.ceil(size[0] / tileSize),
      maxTilesY = Math.ceil(size[1] / tileSize),
      tiles = [], i = 0, j = 0;
  for (; i <= maxTilesX; ++i) {
    for (; j <= maxTilesY; ++j) {
      tiles.push(tile(i, j));
    }
  }

  // TODO: do not throw out all previous tiles, instead manage a cache
  if (this.value) out.rem = this.value;
  this.value = out.source = out.add = tiles;
  return out;
}
