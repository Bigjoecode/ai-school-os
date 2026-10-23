import { z } from 'zod';
import type { SimulatorSpec } from '../practicals';
import { bioDrawingPick, bioNormalise, type BioDrawingStatement } from './bio-common';
import { labBetween, labPick, labRandom, roundDp } from './seeded';

/**
 * bio-specimens: the WAEC Biology Paper 3 specimen bench. A seeded set of 3–5
 * specimens (labelled A, B, C …) from the lesson's topic, each drawn with its
 * observable features. The student examines each with a hand lens, names it,
 * classifies it, labels its parts (drag labels onto the drawing), states its
 * observable features and its functions or adaptations, compares two of them,
 * measures one with a ruler and works out the magnification of a drawing of
 * it, and judges biological drawing practice.
 *
 * Drawings use a 200 × 200 box; label targets are in that box. A measurable
 * specimen's drawing spans exactly x = 20 … 180 along its length.
 */

export interface SpecimenPart {
  label: string;
  x: number;
  y: number;
}
export interface SpecimenDef {
  id: string;
  name: string;
  /** Accepted names (any one, as words, identifies it). */
  aliases: string[];
  parts: SpecimenPart[];
  /** Real length range (cm) when the specimen can be measured; its drawing spans x 20–180. */
  lengthCm: [number, number] | null;
  /** What the length is (e.g. "length", "width across the transverse processes"). */
  lengthOf?: string;
  /** Measured top to bottom (the drawing spans y = 20 … 180) instead of left to right. */
  vertical?: boolean;
  features: string;
  featureKw: string[][];
  functions: string;
  functionKw: string[][];
}

const S = (
  id: string,
  name: string,
  aliases: string[],
  parts: [string, number, number][],
  lengthCm: [number, number] | null,
  features: string,
  featureKw: string[][],
  functions: string,
  functionKw: string[][],
  lengthOf?: string,
): SpecimenDef => ({ id, name, aliases, parts: parts.map(([label, x, y]) => ({ label, x, y })), lengthCm, lengthOf, features, featureKw, functions, functionKw });

export const SPECIMENS: Record<string, SpecimenDef> = Object.fromEntries(
  [
    // ---- kingdoms
    S('mushroom', 'Mushroom', ['mushroom', 'agaricus', 'toadstool'], [['Cap (pileus)', 100, 58], ['Gills', 60, 92], ['Stalk (stipe)', 100, 150], ['Ring (annulus)', 113, 116]], null, 'Umbrella-shaped cap with radiating gills underneath; a stalk with a ring; white or brown — no chlorophyll; no leaves, stems or roots (made of hyphae).', [['cap', 'pileus', 'umbrella'], ['gill', 'gills', 'lamella'], ['stalk', 'stipe'], ['ring', 'annulus'], ['no chlorophyll', 'not green', 'white', 'brown', 'hypha']], 'Gills produce and release spores (reproduction); the hyphae absorb food from dead, decaying matter (saprophytic nutrition).', [['spore', 'spores', 'reproduc'], ['saprophyt', 'decay', 'dead', 'absorb']]),
    S('rhizopus', 'Bread mould (Rhizopus)', ['rhizopus', 'bread mould', 'bread mold', 'mucor', 'mould', 'mold'], [['Sporangium', 60, 50], ['Sporangiophore', 60, 96], ['Stolon', 125, 140], ['Rhizoids', 100, 160]], [0.6, 1.2], 'White cottony threads (hyphae) forming a mycelium; black rounded sporangia on upright sporangiophores; rhizoids at the nodes of stolons; no chlorophyll.', [['hypha', 'hyphae', 'thread', 'mycelium', 'cotton'], ['sporangi', 'black', 'spore case'], ['rhizoid'], ['stolon'], ['no chlorophyll', 'not green', 'white']], 'Sporangia produce and release spores; rhizoids anchor the mould and secrete enzymes and absorb digested food (saprophyte).', [['spore', 'reproduc'], ['rhizoid', 'absorb', 'anchor', 'digest', 'enzyme']], 'width of the patch shown'),
    S('moss', 'Moss', ['moss', 'funaria', 'polytrichum', 'bryophyte'], [['Rhizoids', 30, 100], ['Leafy shoot', 75, 98], ['Seta (stalk)', 138, 100], ['Capsule', 170, 100]], [2, 5], 'A small plant with a short leafy stem bearing tiny simple leaves; rhizoids instead of true roots; a capsule on a long thin stalk (seta); no flowers.', [['rhizoid', 'no true root'], ['leaf', 'leaves', 'leafy'], ['capsule'], ['seta', 'stalk'], ['small', 'tiny', 'no flower']], 'Rhizoids anchor the plant and absorb water; the capsule produces spores; the green leaves photosynthesise.', [['anchor', 'absorb'], ['spore'], ['photosynth', 'food']]),
    S('fern', 'Fern', ['fern', 'dryopteris', 'nephrolepis', 'pteridophyte', 'frond'], [['Rachis', 100, 101], ['Pinna (leaflet)', 72, 66], ['Sori', 140, 130]], [20, 40], 'A compound leaf (frond) divided into many pinnae along a rachis; brown sori (spore cases) in rows on the underside of the pinnae; young fronds coiled (circinate).', [['frond', 'compound', 'pinna', 'pinnae', 'leaflet'], ['sori', 'sorus', 'spore'], ['rachis', 'midrib'], ['coil', 'circinate', 'crozier']], 'Sori contain sporangia that produce spores; the green pinnae photosynthesise.', [['spore', 'reproduc'], ['photosynth', 'food', 'chlorophyll']], 'length of the frond'),
    S('earthworm', 'Earthworm', ['earthworm', 'earth worm', 'lumbricus', 'worm'], [['Prostomium', 24, 100], ['Clitellum', 68, 100], ['Segment', 132, 100]], [10, 18], 'Long, cylindrical, segmented body; a swollen clitellum (saddle) near the front; no legs; moist slimy skin with tiny bristles (chaetae).', [['segment', 'ring'], ['clitellum', 'saddle'], ['no leg', 'legless'], ['moist', 'slimy', 'mucus'], ['chaeta', 'setae', 'bristle'], ['cylindric', 'long']], 'Chaetae grip the soil during movement; the moist skin is used for gaseous exchange; the clitellum secretes the cocoon.', [['chaeta', 'setae', 'bristle', 'grip'], ['moist', 'gas', 'respir', 'breath'], ['cocoon', 'clitellum', 'reproduc']]),
    S('snail', 'Snail', ['snail', 'bulinus', 'biomphalaria', 'limnaea', 'lymnaea', 'achatina'], [['Shell', 140, 78], ['Tentacle', 34, 66], ['Foot', 80, 142]], [2, 4], 'A soft, unsegmented body; a coiled (spiral) shell; a broad muscular foot; tentacles on the head with eyes; slimy.', [['soft', 'unsegmented'], ['shell', 'coiled', 'spiral'], ['foot'], ['tentacle', 'eye'], ['slime', 'mucus', 'slimy']], 'The shell protects the soft body and reduces drying; the muscular foot glides on slime for movement; tentacles sense the surroundings.', [['protect', 'drying', 'water loss'], ['foot', 'move', 'glide', 'crawl'], ['tentacle', 'sense', 'feel', 'touch']]),
    S('cockroach', 'Cockroach', ['cockroach', 'periplaneta', 'roach'], [['Antenna', 44, 42], ['Head', 27, 100], ['Wing', 118, 86], ['Jointed leg', 90, 150]], [2.5, 4], 'Body in three parts (head, thorax, abdomen); one pair of long antennae; three pairs of jointed legs; two pairs of wings, the forewings leathery; flattened brown body with an exoskeleton.', [['head', 'thorax', 'abdomen', 'three part'], ['antenna'], ['three pair', 'six leg', 'jointed leg', '6 leg', 'legs'], ['wing'], ['flat', 'brown', 'exoskeleton', 'chitin']], 'Antennae sense touch and smell; the flattened body lets it hide in cracks; long legs for running fast; wings for flight.', [['antenna', 'smell', 'touch', 'sense', 'feel'], ['flat', 'crack', 'hide', 'crevice'], ['run', 'fast', 'leg'], ['fly', 'flight']], 'length of the body'),
    S('toad', 'Toad', ['toad', 'bufo', 'frog'], [['Eye', 40, 80], ['Parotid gland', 64, 76], ['Forelimb', 56, 142], ['Webbed hind foot', 168, 138]], [6, 12], 'Warty skin; no tail; large bulging eyes; parotid glands behind the eyes; short forelimbs and long hind limbs with webbed feet; no scales.', [['wart', 'skin'], ['no tail', 'tailless'], ['hind', 'long leg', 'limb'], ['web'], ['eye', 'bulging'], ['parotid', 'gland']], 'Webbed feet for swimming; long hind limbs for hopping; moist skin for gaseous exchange; parotid glands secrete a poison for defence.', [['web', 'swim'], ['hop', 'jump', 'leap'], ['skin', 'gas', 'breath', 'respir'], ['poison', 'defence', 'defense', 'parotid']], 'length from snout to the outstretched hind foot'),
    S('tilapia', 'Tilapia (bony fish)', ['tilapia', 'fish', 'oreochromis'], [['Operculum', 56, 96], ['Dorsal fin', 100, 46], ['Lateral line', 112, 100], ['Caudal fin', 170, 100]], [10, 20], 'Streamlined body covered with overlapping scales; fins (dorsal, pectoral, pelvic, anal and caudal); an operculum covering the gills; a lateral line; eyes without eyelids.', [['streamline', 'spindle', 'boat'], ['scale'], ['fin'], ['operculum', 'gill'], ['lateral line']], 'Streamlined shape reduces resistance in water; fins balance, steer and propel; gills absorb dissolved oxygen; the lateral line detects vibrations; scales protect.', [['streamline', 'resistance'], ['fin', 'balance', 'steer', 'propel', 'swim'], ['gill', 'breath', 'oxygen', 'respir'], ['lateral', 'vibration', 'pressure']]),

    // ---- vertebrae
    S('atlas', 'Atlas vertebra', ['atlas'], [['Transverse process (wing)', 36, 100], ['Neural canal', 100, 102], ['Facet for occipital condyle', 72, 78]], [5, 8], 'Ring-shaped; no centrum; broad, flat, wing-like transverse processes; a large neural canal; large articular facets for the occipital condyles of the skull; no neural spine.', [['ring'], ['no centrum'], ['wing', 'transverse', 'flat', 'broad'], ['facet', 'condyle'], ['neural canal', 'large canal', 'canal']], 'Carries the skull: the facets articulate with the occipital condyles, allowing the head to nod; the broad wings give attachment to neck muscles.', [['skull', 'head', 'nod'], ['condyle', 'articulat', 'joint'], ['muscle']], 'width across the transverse processes'),
    S('axis', 'Axis vertebra', ['axis'], [['Odontoid process', 30, 112], ['Neural spine', 110, 56], ['Centrum', 92, 128], ['Postzygapophysis', 168, 104]], [5, 8], 'A peg-like odontoid process projecting forward from the centrum; a large, flat, blade-like neural spine; a large centrum; small transverse processes.', [['odontoid', 'peg', 'dens'], ['spine', 'blade', 'flat'], ['centrum'], ['transverse', 'small']], 'The odontoid process forms a pivot about which the atlas and skull rotate (shaking the head); the large spine anchors neck muscles.', [['pivot', 'rotat', 'turn', 'side to side', 'shake'], ['muscle']], 'length from the odontoid process to the back'),
    S('cervical', 'Cervical vertebra', ['cervical'], [['Neural spine', 100, 42], ['Neural canal', 100, 92], ['Centrum', 100, 140], ['Vertebrarterial canal', 46, 112]], [4, 6], 'A short neural spine; vertebrarterial canals in the transverse processes; a wide neural canal; a small centrum; cervical ribs fused to the transverse processes.', [['short spine', 'small spine', 'spine'], ['vertebrarterial', 'foramen'], ['neural canal', 'canal'], ['centrum'], ['transverse', 'rib']], 'Vertebrarterial canals let the vertebral arteries pass to the head; the neck vertebrae support the neck and allow it to bend; processes anchor neck muscles.', [['artery', 'blood', 'vessel'], ['neck', 'support', 'flexib', 'bend'], ['muscle']], 'width across the transverse processes'),
    S('thoracic', 'Thoracic vertebra', ['thoracic', 'dorsal vertebra'], [['Neural spine', 128, 66], ['Centrum', 44, 146], ['Facet for rib', 26, 126]], [5, 8], 'A very long neural spine pointing backwards; facets on the centrum and transverse processes for the ribs; short transverse processes; a heart-shaped centrum.', [['long', 'spine', 'backward'], ['facet', 'rib'], ['transverse', 'short'], ['centrum']], 'Articulates with the ribs to form the rib cage protecting the heart and lungs; the long spine anchors muscles and ligaments that support the head and neck.', [['rib'], ['muscle', 'ligament'], ['protect', 'chest', 'thorax', 'lungs', 'heart']], 'length from the front of the centrum to the tip of the spine'),
    S('lumbar', 'Lumbar vertebra', ['lumbar'], [['Transverse process', 34, 116], ['Centrum', 100, 146], ['Neural spine', 100, 40], ['Neural canal', 100, 96]], [8, 12], 'A large, thick centrum; long, broad transverse processes pointing forwards and downwards; a short, broad neural spine; extra processes (metapophyses and anapophyses).', [['large centrum', 'thick centrum', 'big centrum', 'centrum'], ['transverse', 'long', 'broad'], ['spine'], ['metapophys', 'anapophys', 'extra process']], 'Supports the weight of the abdomen; the large processes give attachment to the strong back and abdominal muscles.', [['weight', 'support'], ['muscle']], 'width across the transverse processes'),
    S('sacrum', 'Sacrum (sacral vertebrae)', ['sacrum', 'sacral'], [['Wing (fused transverse processes)', 36, 66], ['Fused neural spines', 112, 98], ['Sacral foramen', 122, 122]], [10, 15], 'Several (3–5) vertebrae fused into one triangular bone; broad wing-like transverse processes at the front; a row of reduced neural spines; paired holes (foramina) for nerves.', [['fused', 'fusion'], ['triangle', 'triangular'], ['wing', 'broad', 'transverse'], ['foramen', 'foramina', 'hole'], ['spine']], 'Fused to the pelvic girdle to give a firm support; transmits the thrust of the hind limbs to the vertebral column.', [['pelvic', 'girdle', 'hip', 'ilium'], ['support', 'strength', 'firm', 'rigid'], ['hind limb', 'leg', 'thrust', 'weight']]),
    S('caudal', 'Caudal vertebra', ['caudal', 'tail vertebra', 'coccygeal'], [['Centrum', 100, 100], ['Articular surface', 22, 100]], [1.5, 3], 'Small and rod-like; reduced to a centrum; no neural arch or neural canal; processes tiny or absent.', [['small', 'tiny'], ['centrum', 'rod'], ['no neural', 'no canal', 'no arch', 'absent', 'no spine'], ['process']], 'Supports the tail; gives attachment to the muscles that move the tail.', [['tail'], ['muscle', 'move']]),

    // ---- limb bones and girdles
    S('humerus', 'Humerus', ['humerus'], [['Head', 32, 95], ['Deltoid ridge', 80, 86], ['Shaft', 118, 100], ['Trochlea', 170, 106]], [12, 18], 'A rounded head with tuberosities at the upper end; a deltoid ridge; a long, hollow shaft; a trochlea and the olecranon fossa at the lower end.', [['head', 'round'], ['deltoid', 'ridge'], ['shaft', 'long', 'hollow'], ['trochlea', 'condyle', 'fossa'], ['tuberos']], 'The head fits into the glenoid cavity (ball-and-socket joint at the shoulder); the trochlea hinges with the ulna at the elbow; the ridge anchors the deltoid muscle.', [['glenoid', 'shoulder', 'ball'], ['elbow', 'hinge', 'ulna'], ['muscle']]),
    S('femur', 'Femur', ['femur', 'thigh bone'], [['Head', 28, 82], ['Greater trochanter', 58, 112], ['Shaft', 110, 100], ['Condyle', 172, 100]], [16, 24], 'A rounded head on a short neck; greater and lesser trochanters; a long straight shaft; two condyles at the lower end.', [['head', 'round'], ['neck'], ['trochanter'], ['shaft', 'long'], ['condyle']], 'The head fits into the acetabulum (hip ball-and-socket joint); the condyles form the knee hinge joint with the tibia; trochanters anchor muscles; it supports the body weight.', [['acetabulum', 'hip', 'ball'], ['knee', 'tibia', 'hinge'], ['muscle'], ['weight', 'support']]),
    S('scapula', 'Scapula (shoulder blade)', ['scapula', 'shoulder blade'], [['Glenoid cavity', 24, 100], ['Acromion process', 56, 76], ['Spine', 112, 94], ['Blade', 140, 132]], [10, 16], 'A flat, triangular bone; a ridge (the spine) across its outer surface ending in the acromion; a glenoid cavity at the narrow end; a coracoid process.', [['flat', 'triangular', 'triangle', 'blade'], ['spine', 'ridge'], ['glenoid', 'cavity'], ['acromion', 'coracoid', 'process']], 'The glenoid cavity takes the head of the humerus (shoulder joint); the broad flat surface anchors the muscles of the fore limb and shoulder; part of the pectoral girdle.', [['humerus', 'glenoid', 'shoulder'], ['muscle'], ['fore limb', 'forelimb', 'support', 'girdle']]),
    S('pelvic-girdle', 'Pelvic girdle (half)', ['pelvic', 'pelvis', 'innominate', 'hip bone', 'os coxa'], [['Ilium', 46, 88], ['Acetabulum', 100, 100], ['Obturator foramen', 146, 108], ['Pubis', 140, 142]], [15, 22], 'The ilium, ischium and pubis fused together; a deep cup-shaped acetabulum; a large obturator foramen; the ilium attaches to the sacrum.', [['ilium', 'ischium', 'pubis', 'fused'], ['acetabulum', 'socket', 'cup'], ['obturator', 'foramen', 'hole']], 'The acetabulum takes the head of the femur (hip joint); the girdle supports the hind limbs and transmits their thrust to the backbone; it protects the pelvic organs; the foramen lightens the bone and lets nerves and blood vessels through.', [['femur', 'acetabulum', 'hip', 'ball'], ['support', 'thrust', 'weight'], ['protect'], ['nerve', 'blood', 'light']]),
    S('radius-ulna', 'Radius and ulna', ['radius', 'ulna'], [['Olecranon process', 28, 90], ['Sigmoid notch', 52, 104], ['Radius', 122, 90], ['Ulna', 122, 113]], [12, 18], 'Two bones lying side by side, partly fused; the ulna has an olecranon process (the elbow) and a sigmoid notch; the radius is slightly curved.', [['two bone', 'radius', 'ulna'], ['olecranon', 'elbow'], ['sigmoid', 'notch'], ['fused', 'curved']], 'The olecranon process stops the arm over-extending and anchors the triceps; the sigmoid notch hinges with the trochlea of the humerus; the radius turns to rotate the wrist.', [['olecranon', 'over', 'extension', 'triceps', 'muscle'], ['hinge', 'trochlea', 'elbow', 'humerus'], ['rotat', 'wrist', 'twist']]),
    S('tibia-fibula', 'Tibia and fibula', ['tibia', 'fibula'], [['Cnemial crest', 56, 82], ['Tibia', 104, 94], ['Fibula', 112, 120]], [16, 24], 'Two bones: a thick tibia with a cnemial crest and a thin fibula, fused at the lower end; a broad upper end that forms the knee.', [['tibia', 'fibula', 'two bone'], ['thick', 'thin'], ['fused'], ['crest', 'cnemial']], 'Supports the body weight; forms the knee hinge joint with the femur; the crest anchors the leg muscles.', [['weight', 'support'], ['knee', 'hinge', 'femur'], ['muscle']]),

    // ---- organs
    S('heart', 'Mammalian heart (external view)', ['heart'], [['Aorta', 82, 30], ['Pulmonary artery', 120, 46], ['Right atrium', 58, 76], ['Coronary artery', 110, 118]], [9, 13], 'A cone-shaped, muscular, reddish-brown organ; coronary arteries branching over the surface; thin-walled atria at the broad top and thick-walled ventricles below; the aorta, pulmonary artery and venae cavae at the top.', [['muscular', 'cone', 'conical'], ['coronary'], ['atri', 'auricle'], ['ventricle'], ['aorta', 'vessel', 'vena', 'pulmonary']], 'Pumps blood round the body and to the lungs; the coronary arteries supply the heart muscle with oxygen and food.', [['pump', 'circulat'], ['coronary', 'oxygen', 'supply', 'nourish']], 'length from the top of the atria to the apex'),
    S('heart-ls', 'Mammalian heart (longitudinal section)', ['heart'], [['Left ventricle (wall)', 140, 132], ['Septum', 100, 132], ['Tricuspid valve', 68, 102], ['Bicuspid valve', 132, 98]], null, 'Four chambers; the left ventricle wall much thicker than the right; a septum between the left and right sides; tricuspid and bicuspid valves held by tendons (chordae tendineae) to papillary muscles.', [['four', 'chambers'], ['thick', 'left ventricle'], ['septum'], ['valve', 'tricuspid', 'bicuspid', 'mitral'], ['tendon', 'chordae', 'papillary']], 'The thick left ventricle pumps blood at high pressure round the whole body; valves stop blood flowing back; the septum keeps oxygenated and deoxygenated blood apart.', [['pressure', 'whole body', 'force'], ['backflow', 'back flow', 'one direction', 'flow back', 'flowing back'], ['septum', 'mix', 'separate', 'oxygenated']]),
    S('artery', 'Artery (transverse section)', ['artery', 'aorta', 'arterial'], [['Lumen', 100, 100], ['Thick muscle and elastic layer', 146, 100], ['Outer coat', 176, 100]], null, 'A round, narrow lumen; a thick wall of muscle and elastic fibres; a smooth inner lining; keeps its round shape when empty; no valves.', [['narrow', 'small lumen', 'round'], ['thick'], ['muscle', 'elastic'], ['no valve'], ['lining', 'endothel']], 'Carries blood away from the heart at high pressure; the elastic wall stretches and recoils to keep the blood flowing (pulse).', [['away from the heart', 'from the heart', 'away'], ['pressure', 'elastic', 'stretch', 'recoil', 'pulse']]),
    S('vein', 'Vein (transverse section)', ['vein', 'vena', 'venous'], [['Lumen', 96, 104], ['Thin muscle layer', 150, 100], ['Outer coat', 178, 100]], null, 'A wide, irregular lumen; a thin wall with little muscle and elastic tissue; collapses when empty; has valves along its length.', [['wide', 'large lumen', 'irregular'], ['thin'], ['little muscle', 'less muscle', 'muscle'], ['valve'], ['collapse', 'flat']], 'Carries blood back to the heart at low pressure; valves prevent backflow.', [['to the heart', 'towards the heart', 'back'], ['low pressure', 'valve', 'backflow', 'back flow']]),
    S('kidney', 'Mammalian kidney (external view)', ['kidney', 'renal'], [['Capsule (surface)', 40, 124], ['Renal artery', 84, 44], ['Renal vein', 100, 36], ['Ureter', 118, 44]], [5.5, 8], 'A bean-shaped, reddish-brown organ with a smooth surface covered by a thin fibrous capsule; a hilum (notch) on the concave side where the renal artery, renal vein and ureter join it.', [['bean'], ['reddish', 'brown', 'red'], ['capsule', 'smooth'], ['hilum', 'notch', 'concave'], ['artery', 'vein', 'ureter']], 'Removes urea, excess water and salts from the blood (excretion and osmoregulation); the ureter carries urine to the bladder.', [['urea', 'excret', 'filter', 'waste'], ['water', 'salt', 'osmoreg'], ['urine', 'ureter', 'bladder']]),
    S('kidney-ls', 'Mammalian kidney (longitudinal section)', ['kidney', 'renal'], [['Cortex', 42, 128], ['Medulla (pyramid)', 74, 104], ['Pelvis', 100, 80], ['Ureter', 100, 32]], [5.5, 8], 'An outer, darker, granular cortex; an inner, paler, striped medulla forming cone-shaped pyramids; a funnel-shaped pelvis; the ureter leaving at the hilum.', [['cortex', 'outer', 'dark'], ['medulla', 'pyramid', 'striped'], ['pelvis', 'funnel'], ['ureter', 'hilum']], 'The cortex contains the glomeruli and Bowman’s capsules (ultrafiltration); the medulla holds the loops of Henle and collecting ducts (reabsorption of water); the pelvis collects urine for the ureter.', [['bowman', 'glomerul', 'filtrat', 'nephron'], ['reabsor', 'loop', 'collecting', 'water'], ['collect', 'urine']]),
    S('eye', 'Mammalian eye (vertical section)', ['eye', 'eyeball'], [['Cornea', 23, 100], ['Lens', 62, 100], ['Retina', 150, 58], ['Optic nerve', 174, 112]], [2.5, 3.5], 'A spherical eyeball; a transparent, bulging cornea in front; a biconvex lens held by suspensory ligaments; three layers (sclera, choroid and retina); jelly-like vitreous humour; the optic nerve at the back.', [['spher', 'round', 'ball'], ['cornea', 'transparent'], ['lens', 'biconvex'], ['sclera', 'choroid', 'retina', 'layer'], ['optic nerve', 'nerve'], ['humour', 'humor', 'jelly']], 'The cornea and lens refract light and focus it on the retina; the retina has rods and cones that are sensitive to light; the optic nerve carries impulses to the brain.', [['focus', 'refract', 'bend'], ['rod', 'cone', 'light sensitive', 'retina', 'image'], ['impulse', 'brain', 'nerve']], 'diameter from the cornea to the back of the eyeball'),
    S('eye-front', 'Eye (external front view)', ['eye'], [['Pupil', 100, 100], ['Iris', 124, 100], ['Sclera', 44, 100], ['Eyelid', 100, 58]], null, 'Upper and lower eyelids with eyelashes; the white sclera; a coloured iris with a black central pupil; the conjunctiva covering the front.', [['eyelid', 'lid'], ['lash'], ['sclera', 'white'], ['iris', 'colour', 'color'], ['pupil', 'black']], 'The iris controls the size of the pupil and so the amount of light entering; eyelids and lashes protect the eye from dust; tears keep it moist.', [['iris', 'light', 'pupil'], ['protect', 'dust'], ['tear', 'moist', 'lubric', 'blink']]),

    // ---- flowers
    S('hibiscus', 'Hibiscus flower', ['hibiscus'], [['Epicalyx', 46, 102], ['Petal', 94, 54], ['Staminal tube', 150, 100], ['Stigma', 176, 92]], [8, 12], 'Large, brightly coloured (red) petals, five and free; an epicalyx below the calyx; five fused sepals; many stamens fused into a staminal tube around the style; five stigmas; radially symmetrical.', [['large', 'bright', 'red', 'colour', 'color'], ['epicalyx'], ['sepal', 'calyx'], ['staminal', 'stamen', 'tube'], ['stigma'], ['radial', 'actinomorph', 'regular']], 'Bright petals and nectar attract insects for pollination; the anthers on the staminal tube produce pollen; the stigmas receive pollen.', [['attract', 'insect'], ['pollen', 'anther'], ['stigma', 'receive']]),
    S('hibiscus-ls', 'Half-flower of Hibiscus (L.S.)', ['hibiscus', 'half flower'], [['Receptacle', 34, 112], ['Ovary', 62, 108], ['Style', 112, 96], ['Anthers', 142, 82]], [6, 9], 'A superior ovary on the receptacle with ovules on axile placentas; a long style running up inside the staminal tube; anthers on short filaments along the tube; petals and sepals cut in half.', [['superior', 'ovary'], ['ovule'], ['style'], ['anther', 'stamen', 'filament'], ['receptacle']], 'The ovary contains ovules that become seeds (the ovary becomes the fruit); anthers produce pollen; the style carries the pollen tube to the ovary.', [['ovule', 'seed', 'fruit'], ['pollen'], ['style', 'pollen tube', 'tube']]),
    S('caesalpinia', 'Pride of Barbados (Caesalpinia) flower', ['caesalpinia', 'pride of barbados', 'flamboyant', 'peacock flower'], [['Sepal', 40, 116], ['Petal', 62, 66], ['Stamen (long filament)', 148, 96], ['Anther', 176, 80]], [7, 11], 'Five unequal, clawed petals, red or orange with yellow edges; ten very long free stamens projecting well beyond the petals; one carpel; bilaterally symmetrical; long pedicel.', [['unequal', 'claw'], ['red', 'orange', 'yellow', 'bright'], ['long stamen', 'stamen', 'projecting', 'ten'], ['carpel', 'one'], ['bilateral', 'zygomorph', 'irregular']], 'Bright petals attract insects and birds; the long projecting stamens brush pollen onto visitors.', [['attract', 'insect', 'bird'], ['pollen', 'brush', 'stamen']]),
    S('crotalaria', 'Crotalaria (pea) flower', ['crotalaria', 'pea', 'papilionaceous', 'legume flower'], [['Standard petal', 110, 50], ['Wing petal', 100, 100], ['Keel', 132, 130], ['Calyx', 40, 116]], [1.5, 2.5], 'Yellow; a butterfly-shaped (papilionaceous) corolla of a large standard petal, two wings and a boat-shaped keel; stamens and style enclosed in the keel; bilaterally symmetrical.', [['yellow'], ['standard', 'vexillum'], ['wing'], ['keel', 'boat'], ['bilateral', 'zygomorph', 'irregular', 'butterfly']], 'The standard attracts insects; the wings are a landing platform; the keel encloses the stamens, which spring out and dust pollen on an insect that lands.', [['attract', 'standard'], ['keel', 'spring', 'enclose', 'press'], ['land', 'platform', 'wing']]),
    S('allamanda', 'Allamanda flower', ['allamanda'], [['Calyx', 26, 100], ['Corolla tube', 66, 100], ['Corolla lobe', 156, 58]], [7, 10], 'A large, bright yellow, trumpet-shaped corolla of five fused petals (gamopetalous) with spreading lobes; stamens attached inside the corolla tube (epipetalous); a small green calyx; scented.', [['yellow', 'bright', 'large'], ['trumpet', 'funnel', 'tube'], ['fused', 'gamopetal'], ['epipetal', 'inside', 'stamen'], ['scent']], 'Colour, scent and nectar attract insects; the long tube guides an insect to the nectar past the anthers and stigma.', [['attract', 'insect'], ['nectar', 'tube', 'guide']]),
    S('maize-tassel', 'Maize tassel (male inflorescence)', ['tassel', 'maize', 'corn'], [['Main axis', 40, 100], ['Spikelet', 100, 66], ['Dangling anther', 132, 124]], [20, 35], 'A branched terminal inflorescence (panicle) of many small, dull green spikelets; no petals, scent or nectar; anthers dangle on long thin filaments; large amounts of pollen.', [['branch', 'panicle', 'terminal'], ['small', 'dull', 'green'], ['no petal', 'no scent', 'no nectar'], ['dangl', 'hang', 'long filament'], ['much pollen', 'plenty', 'large amount', 'many pollen']], 'Dangling anthers shake their pollen into the wind; it makes large amounts of light, dry pollen (wind pollination).', [['wind', 'shake'], ['light', 'dry', 'smooth', 'pollen']]),
    S('grass-flower', 'Grass flower (spikelet)', ['grass', 'spikelet', 'guinea grass', 'elephant grass', 'floret'], [['Glume', 60, 100], ['Feathery stigma', 150, 60], ['Anther', 152, 136]], [0.4, 0.8], 'Small and dull green; enclosed by bracts (glumes, lemma and palea), not petals; large feathery stigmas hanging out; versatile anthers on long filaments hanging outside; no scent or nectar.', [['small', 'dull', 'green'], ['glume', 'bract', 'lemma', 'palea'], ['feather', 'stigma'], ['anther', 'filament', 'hang', 'versatile'], ['no scent', 'no nectar', 'no petal']], 'Feathery stigmas trap pollen from the air; dangling (versatile) anthers release pollen into the wind.', [['feather', 'trap', 'catch', 'stigma'], ['wind', 'anther', 'release']]),

    // ---- fruits
    S('tomato', 'Tomato (transverse section)', ['tomato'], [['Epicarp (skin)', 24, 100], ['Seed', 92, 68], ['Placenta', 100, 100]], [4, 7], 'Fleshy and juicy; a thin skin (epicarp); many seeds on axile placentas in two to four chambers (locules); a persistent calyx.', [['fleshy', 'juicy', 'succulent'], ['skin', 'epicarp'], ['many seed', 'seeds'], ['placenta', 'axile'], ['locule', 'chamber']], 'The bright colour and juicy flesh attract animals, which eat it and disperse the seeds (seeds survive digestion).', [['attract', 'eaten', 'animal', 'bird'], ['disperse', 'dispersal', 'spread']], 'diameter'),
    S('orange', 'Orange (transverse section)', ['orange', 'citrus'], [['Epicarp with oil glands', 24, 100], ['Seed', 100, 84], ['Segment with juice sacs', 132, 112]], [6, 9], 'Round; a thick rind with oil glands (epicarp); a white spongy mesocarp; 8–12 segments (carpels) full of juicy hairs; seeds near the centre (axile placentation).', [['rind', 'oil', 'gland', 'epicarp'], ['white', 'spongy', 'mesocarp'], ['segment', 'carpel'], ['juice', 'hair', 'sac'], ['seed']], 'The juicy segments are eaten by animals and people who throw away the seeds (dispersal); the rind protects.', [['eaten', 'animal', 'man', 'disperse', 'people'], ['protect', 'rind']], 'diameter'),
    S('mango', 'Mango (longitudinal section)', ['mango'], [['Epicarp (skin)', 24, 100], ['Mesocarp (flesh)', 60, 68], ['Endocarp (stone)', 100, 100], ['Seed', 118, 102]], [8, 14], 'A fleshy fruit with a thin, smooth skin; a thick, juicy, yellow mesocarp; a hard, stony, fibrous endocarp; one seed.', [['fleshy', 'juicy', 'drupe'], ['skin', 'epicarp', 'thin'], ['mesocarp', 'flesh', 'yellow'], ['stone', 'endocarp', 'hard'], ['one seed', 'single seed']], 'The fleshy mesocarp is eaten by animals; the hard endocarp protects the seed so it survives and is dropped away from the parent.', [['eaten', 'animal', 'attract'], ['protect', 'hard', 'stone', 'endocarp']]),
    S('coconut', 'Coconut (longitudinal section)', ['coconut'], [['Epicarp', 24, 100], ['Fibrous mesocarp', 48, 62], ['Endocarp (shell)', 82, 74], ['Endosperm', 112, 86]], [20, 30], 'Large; a smooth, waterproof epicarp; a thick fibrous mesocarp (husk) full of air; a hard stony endocarp (shell) with three eyes; white endosperm and coconut water.', [['large', 'big'], ['smooth', 'waterproof', 'epicarp'], ['fibre', 'fiber', 'fibrous', 'husk', 'air'], ['endocarp', 'shell', 'hard', 'eye'], ['endosperm', 'white', 'meat', 'water', 'milk']], 'The fibrous, air-filled mesocarp makes it float, so it is dispersed by water; the waterproof epicarp keeps water out; the endosperm stores food for the embryo.', [['float', 'water', 'sea', 'buoyant'], ['food', 'store', 'embryo', 'nourish']]),
    S('cowpea-pod', 'Cowpea pod (legume)', ['cowpea', 'bean', 'legume', 'pod', 'pea pod'], [['Stalk (pedicel)', 24, 100], ['Seed', 80, 98], ['Suture', 112, 114], ['Remains of style', 176, 98]], [12, 20], 'A long, narrow, dry pod formed from one carpel; seeds in a row along one edge (marginal placentation); splits along two sutures; remains of the style at the tip.', [['long', 'narrow', 'pod'], ['dry'], ['one carpel', 'single carpel', 'monocarpel'], ['row', 'marginal'], ['split', 'suture', 'dehisc'], ['style', 'beak']], 'When dry it splits along both sutures and the halves twist, throwing the seeds out (explosive self-dispersal).', [['split', 'twist', 'burst', 'explos', 'dehisc'], ['throw', 'scatter', 'self']]),
    S('okra', 'Okra fruit (capsule)', ['okra', 'lady s finger', 'ladys finger', 'lady finger'], [['Stalk', 24, 100], ['Ridge', 100, 82], ['Seeds', 132, 104]], [6, 12], 'A long, ridged (five ridges), tapering fruit; green and hairy when young; when dry it splits along the ridges (a capsule) to release many round seeds in five rows.', [['ridge', 'ridged', 'five'], ['taper', 'pointed', 'long'], ['hairy', 'green'], ['split', 'dehisc', 'capsule'], ['many seed', 'seeds', 'locule']], 'The dry capsule splits to release its seeds; the young fruit is eaten as a vegetable.', [['split', 'release', 'dehisc'], ['eat', 'vegetable', 'food']]),
    S('maize-grain', 'Maize grain (L.S.)', ['maize', 'corn', 'grain', 'caryopsis'], [['Pericarp', 24, 100], ['Endosperm', 70, 90], ['Scutellum', 134, 112], ['Plumule', 150, 86]], [0.8, 1.2], 'Small, dry, indehiscent and one-seeded; the fruit wall (pericarp) fused to the seed coat; a large starchy endosperm; the embryo (scutellum, plumule and radicle) to one side.', [['dry', 'small'], ['indehisc', 'one seed', 'single seed'], ['fused', 'pericarp', 'testa', 'wall'], ['endosperm', 'starch'], ['embryo', 'scutellum', 'plumule', 'radicle']], 'The endosperm stores starch for germination; the scutellum absorbs food from it for the embryo; the pericarp protects the seed.', [['store', 'food', 'starch'], ['scutellum', 'absorb', 'transfer'], ['protect']]),
    S('cashew', 'Cashew (false fruit)', ['cashew', 'anacardium'], [['Stalk', 22, 100], ['Cashew apple (swollen pedicel)', 82, 100], ['Nut (true fruit)', 164, 110]], [6, 10], 'A fleshy, juicy, pear-shaped “apple” formed from the swollen pedicel, not the ovary; a kidney-shaped nut (the true fruit) at its end; red or yellow.', [['swollen', 'pedicel', 'stalk', 'receptacle'], ['false', 'not ovary', 'pseudo'], ['kidney', 'nut'], ['red', 'yellow', 'juicy', 'fleshy']], 'The fleshy apple attracts animals that carry the fruit away (dispersal); the nut contains the seed.', [['attract', 'animal', 'eaten', 'disperse'], ['seed', 'nut']]),
    S('pineapple', 'Pineapple (multiple fruit)', ['pineapple', 'ananas'], [['Stalk', 22, 100], ['Fruitlet', 70, 88], ['Crown of leaves', 160, 100]], [20, 30], 'Many fruitlets (from the many flowers of one inflorescence) fused round a central axis — a multiple fruit; hexagonal “eyes” on the surface; a crown of spiny leaves; fleshy and juicy.', [['many', 'fruitlet', 'fused', 'multiple', 'composite'], ['hexagon', 'eye', 'pattern'], ['crown', 'leaves'], ['fleshy', 'juicy'], ['axis', 'core']], 'The crown can be planted to grow a new plant (vegetative propagation); the juicy flesh is eaten by animals and people.', [['crown', 'plant', 'propagat', 'vegetative'], ['eaten', 'animal', 'man', 'food']], 'length including the crown'),

    // ---- dispersal
    S('tridax', 'Tridax fruit', ['tridax', 'achene', 'cypsela'], [['Fruit (achene)', 36, 100], ['Pappus', 150, 80]], [0.6, 1], 'Small, light, dry, one-seeded fruit (achene/cypsela); a crown of feathery hairs (pappus) at the top; dark brown.', [['small', 'light'], ['pappus', 'hair', 'feather', 'parachute'], ['achene', 'cypsela', 'one seed', 'dry']], 'The pappus acts as a parachute so the wind carries the fruit far from the parent plant.', [['wind', 'air', 'parachute', 'float', 'carried'], ['far', 'away', 'distance']], 'length including the pappus'),
    S('combretum', 'Combretum fruit (winged)', ['combretum', 'winged fruit', 'terminalia'], [['Wing', 44, 100], ['Seed-bearing centre', 100, 100]], [1.5, 3], 'Four thin, papery wings; light, dry and indehiscent; the seed in the swollen centre; brown when ripe.', [['wing', 'papery', 'four'], ['light'], ['dry', 'indehisc'], ['centre', 'center', 'seed'], ['brown']], 'The wings give a large surface area so the fruit spins and glides in the wind and is carried far from the parent.', [['wind', 'air', 'glide', 'spin'], ['surface area', 'far', 'away', 'distance']], 'width across the wings'),
    S('desmodium', 'Desmodium fruit (hooked)', ['desmodium', 'loment', 'beggar tick', 'tick trefoil'], [['Segment', 58, 100], ['Constriction (joint)', 86, 100], ['Hooked hairs', 122, 84]], [2, 4], 'A flat, jointed pod (loment) that breaks into one-seeded segments; covered with tiny hooked hairs; light and dry.', [['joint', 'segment', 'loment', 'constrict'], ['hook', 'hair', 'bristle'], ['dry', 'light', 'flat']], 'The hooks catch on the fur of animals or on clothing and the segments are carried away.', [['hook', 'cling', 'stick', 'attach', 'catch'], ['animal', 'fur', 'cloth', 'carried']]),

    // ---- teeth and skulls
    S('incisor', 'Incisor tooth', ['incisor'], [['Crown', 40, 100], ['Neck', 80, 100], ['Root', 140, 100]], [1.8, 2.6], 'A chisel-shaped, flattened crown with a sharp, straight cutting edge; one long root.', [['chisel', 'flat'], ['sharp', 'edge', 'cutting'], ['one root', 'single root', 'root']], 'Cutting and biting off food.', [['cut', 'bite', 'nibbl', 'gnaw']]),
    S('canine', 'Canine tooth', ['canine', 'eye tooth', 'fang'], [['Crown', 42, 100], ['Root', 142, 100]], [2.5, 3.5], 'A long, conical, sharply pointed crown, slightly curved; one long root.', [['long', 'conical', 'cone'], ['pointed', 'sharp'], ['curved'], ['one root', 'single root', 'root']], 'Piercing, holding prey and tearing flesh.', [['pierc', 'hold', 'tear', 'grip', 'kill']]),
    S('premolar', 'Premolar tooth', ['premolar', 'pre molar'], [['Cusp', 26, 82], ['Crown', 48, 102], ['Root', 150, 82]], [1.8, 2.4], 'A broad crown with two cusps; one or two roots.', [['broad', 'wide', 'flat'], ['cusp', 'two cusp'], ['two root', 'roots']], 'Crushing and grinding food (shearing in carnivores).', [['crush', 'grind', 'chew']]),
    S('molar', 'Molar tooth', ['molar'], [['Cusps', 24, 80], ['Crown', 50, 104], ['Roots', 150, 62]], [1.8, 2.4], 'A large, broad crown with several cusps and ridges; two or three roots; at the back of the jaw; not present in the milk teeth.', [['broad', 'large', 'big', 'wide'], ['cusp', 'ridge', 'many cusp'], ['three root', 'two or three', 'roots']], 'Grinding and crushing food.', [['grind', 'crush', 'chew']]),
    S('dog-skull', 'Skull of a dog (carnivore)', ['dog', 'carnivore', 'cat', 'lion'], [['Incisor', 22, 122], ['Canine', 40, 132], ['Carnassial tooth', 86, 128], ['Orbit', 76, 76]], [16, 22], 'Long, pointed canines; large carnassial teeth (the last upper premolar and first lower molar) for shearing; small incisors; no gap (diastema); a sagittal crest and large temporal fossa for jaw muscles.', [['canine', 'long', 'pointed', 'fang'], ['carnassial', 'shear'], ['incisor', 'small'], ['no diastema', 'no gap'], ['crest', 'temporal', 'muscle', 'hinge']], 'The canines kill, hold and tear prey; the carnassials shear flesh and crack bones; the jaw hinges tightly for an up-and-down bite — a carnivorous diet.', [['tear', 'kill', 'pierc', 'grip', 'hold'], ['shear', 'slice', 'crack', 'bone'], ['carnivor', 'meat', 'flesh']]),
    S('goat-skull', 'Skull of a goat (herbivore)', ['goat', 'sheep', 'herbivore', 'cow', 'ruminant'], [['Horny pad', 28, 108], ['Diastema', 56, 126], ['Cheek teeth (molars)', 112, 126], ['Orbit', 132, 70]], [18, 25], 'No upper incisors or canines (a horny pad instead); lower incisors and incisor-like canines; a long gap (diastema); broad, ridged premolars and molars; orbits at the sides, far back.', [['no upper incisor', 'horny pad', 'pad'], ['lower incisor', 'incisor'], ['diastema', 'gap'], ['broad', 'ridged', 'ridge', 'molar', 'premolar', 'grinding'], ['orbit', 'eye']], 'The lower incisors cut grass against the horny pad; the diastema lets the tongue move food about; the ridged cheek teeth grind plants with a side-to-side movement — a herbivorous diet.', [['cut', 'crop', 'pad', 'grass'], ['diastema', 'tongue', 'manipulat', 'gap'], ['grind', 'side to side', 'sideways'], ['herbivor', 'plant', 'grass', 'vegetation']]),

    // ---- adaptations to habitats
    S('opuntia', 'Cactus (Opuntia)', ['cactus', 'opuntia', 'prickly pear', 'euphorbia'], [['Spines (leaves)', 62, 48], ['Fleshy green stem', 92, 104], ['Areole', 132, 86]], [15, 25], 'Thick, fleshy, green stems (pads) that store water; leaves reduced to spines in areoles; a thick waxy cuticle; few, sunken stomata.', [['fleshy', 'succulent', 'swollen', 'thick', 'store water'], ['spine', 'reduced leaves'], ['waxy', 'cuticle'], ['stomata', 'sunken', 'few'], ['green stem', 'photosynth']], 'Spines reduce the surface for water loss and protect from grazing animals; the fleshy stem stores water; the green stem photosynthesises; the waxy cuticle reduces transpiration.', [['spine', 'water loss', 'transpir', 'surface'], ['store', 'water', 'succulent'], ['photosynth', 'green'], ['waxy', 'cuticle'], ['protect', 'animal', 'graz']]),
    S('water-lettuce', 'Water lettuce (Pistia)', ['pistia', 'water lettuce'], [['Spongy leaf', 50, 70], ['Rosette centre', 100, 98], ['Feathery roots', 100, 162]], [8, 15], 'A floating rosette of thick, spongy leaves with large air spaces; leaves covered with water-repellent hairs; long feathery roots hanging in the water; stolons.', [['float', 'rosette'], ['spongy', 'air space', 'aerenchyma', 'air'], ['hair', 'velvet', 'water repel'], ['feathery', 'root'], ['stolon', 'runner']], 'Air spaces make it buoyant so it floats; water-repellent hairs stop the leaves becoming waterlogged; feathery roots absorb minerals from the water and keep it balanced.', [['air', 'float', 'buoy'], ['hair', 'repel', 'waterlog', 'wet'], ['root', 'absorb', 'balance', 'mineral']], 'width across the rosette'),
    S('water-lily', 'Water lily leaf (Nymphaea)', ['water lily', 'nymphaea', 'lily'], [['Lamina (leaf blade)', 60, 86], ['Notch', 100, 40], ['Long petiole', 100, 156]], [15, 30], 'A large, flat, circular leaf with a notch, floating on the water; a waxy upper surface with stomata only on the upper side; a long, flexible petiole with large air spaces.', [['large', 'flat', 'circular', 'round'], ['float'], ['waxy', 'cuticle'], ['stomata', 'upper'], ['petiole', 'long', 'flexible'], ['air space', 'air canal', 'aerenchyma']], 'Stomata on the upper surface allow gaseous exchange with the air; air spaces give buoyancy and carry oxygen to the submerged parts; the long, flexible petiole lets the leaf rise and fall with the water level.', [['upper', 'stomata', 'gas'], ['air', 'float', 'buoy', 'oxygen'], ['flexible', 'water level', 'long petiole']], 'width of the leaf blade'),
    S('agama', 'Agama lizard', ['agama', 'lizard'], [['Head', 32, 96], ['Clawed foot', 46, 146], ['Scaly skin', 96, 92], ['Tail', 158, 104]], [20, 30], 'Dry skin covered with horny scales; a long tail; four limbs with clawed toes; a visible ear opening (tympanum); the male has an orange or red head.', [['dry', 'scale', 'scaly', 'horny'], ['tail'], ['claw'], ['four limb', 'limb', 'leg'], ['tympanum', 'ear']], 'Scales reduce water loss on dry land; claws grip when climbing and running; the tail helps it balance.', [['scale', 'water loss', 'drying', 'dry'], ['claw', 'grip', 'climb'], ['tail', 'balance']], 'length including the tail'),

    // ---- insect life cycles
    S('maggot', 'Housefly larva (maggot)', ['maggot', 'larva', 'larvae', 'housefly larva', 'housefly maggot', 'house fly larva'], [['Head end (mouth hooks)', 24, 100], ['Segment', 100, 100], ['Posterior spiracles', 176, 100]], [0.8, 1.2], 'Creamy white; legless; segmented; a pointed head end with mouth hooks; a blunt hind end with spiracles; no eyes.', [['cream', 'white'], ['legless', 'no leg'], ['segment'], ['pointed', 'head', 'hook'], ['spiracle', 'blunt']], 'The mouth hooks are used to feed on decaying matter so it grows quickly; the spiracles take in air.', [['feed', 'eat', 'hook', 'grow'], ['spiracle', 'breath', 'air']]),
    S('pupa', 'Housefly pupa (puparium)', ['pupa', 'puparium', 'pupae', 'housefly pupa', 'house fly pupa'], [['Segment ring', 60, 100], ['Puparium case', 104, 100], ['Spiracle', 176, 100]], [0.5, 0.8], 'Barrel-shaped; a dark brown, hard case (puparium); segmented; immobile and does not feed; no legs or wings visible.', [['barrel', 'oval'], ['brown', 'dark', 'hard'], ['segment'], ['immobile', 'does not move', 'no movement', 'does not feed', 'inactive'], ['no leg', 'no wing']], 'A protective case inside which the larval tissues are rebuilt into the adult (metamorphosis).', [['protect', 'case'], ['change', 'metamorph', 'develop', 'adult']]),
    S('housefly', 'Housefly (adult)', ['housefly', 'house fly', 'musca'], [['Compound eye', 30, 96], ['Wing', 132, 70], ['Abdomen', 116, 104], ['Hairy leg', 70, 150]], [0.6, 0.8], 'One pair of membranous wings; halteres (balancers); large compound eyes; a hairy body and legs; sponging mouthparts (proboscis); three pairs of legs.', [['one pair', 'two wing', 'single pair', 'wing'], ['haltere', 'balancer'], ['compound eye', 'eye'], ['hair', 'bristle'], ['spong', 'proboscis', 'mouthpart']], 'Sponging mouthparts suck up liquid food; hairy legs and body pick up and carry germs; wings for flight and halteres for balance.', [['spong', 'suck', 'liquid', 'feed'], ['hair', 'germ', 'carry', 'pathogen'], ['fly', 'flight', 'balance']], 'length including the folded wings'),
    S('cockroach-nymph', 'Cockroach nymph', ['nymph', 'cockroach nymph'], [['Antenna', 44, 42], ['Wing pad', 112, 86], ['Jointed leg', 90, 150]], [0.8, 1.5], 'Looks like a small adult but has no fully developed wings (only wing pads); immature reproductive organs; three pairs of jointed legs; long antennae.', [['small', 'resembl', 'like the adult', 'similar'], ['no wing', 'wing bud', 'wing pad', 'wingless'], ['immature', 'reproduct'], ['leg', 'jointed'], ['antenna']], 'Feeds and moults (ecdysis) several times, growing into the adult without a pupa (incomplete metamorphosis).', [['moult', 'molt', 'ecdysis', 'grow'], ['incomplete', 'no pupa', 'gradual']]),
    S('grasshopper', 'Grasshopper', ['grasshopper', 'locust', 'zonocerus'], [['Antenna', 30, 60], ['Compound eye', 32, 88], ['Hind leg', 122, 134], ['Forewing', 132, 80]], [4, 7], 'Large, long hind legs; two pairs of wings (narrow, leathery forewings); short antennae; biting mouthparts; body in three parts.', [['hind leg', 'jump', 'large leg', 'long leg'], ['wing', 'tegmen'], ['antenna', 'short'], ['biting', 'chewing', 'mandible', 'mouthpart'], ['head', 'thorax', 'abdomen']], 'The long hind legs are for jumping; the biting mouthparts chew leaves, so it is a pest of crops.', [['jump', 'hop', 'leap'], ['bite', 'chew', 'eat leaves', 'leaf']], 'length including the wings'),

    // ---- associations
    S('root-nodules', 'Legume roots with nodules', ['nodule', 'nodules', 'root nodule'], [['Tap root', 54, 100], ['Root nodule', 92, 88], ['Lateral root', 132, 132]], [8, 15], 'Small, round swellings (nodules) on the roots; pink or red inside when cut; a tap root with lateral roots.', [['nodule', 'swelling', 'round'], ['pink', 'red', 'leghaem'], ['root', 'tap', 'lateral']], 'The nodules hold Rhizobium bacteria that fix nitrogen from the air for the plant; the plant gives the bacteria food — both benefit (mutualism).', [['rhizobium', 'bacteri'], ['nitrogen', 'fix'], ['food', 'carbohydrate', 'sugar', 'both benefit', 'mutual']]),
    S('lichen', 'Lichen', ['lichen'], [['Thallus', 100, 92], ['Cup-like fruiting body', 132, 70], ['Bark (support)', 40, 152]], null, 'A grey-green, flat, crusty or leafy patch (thallus) on bark or rock; cup-like fruiting bodies; made of a fungus and an alga growing together.', [['grey', 'gray', 'green'], ['crust', 'leafy', 'flat', 'thallus', 'patch'], ['cup', 'fruiting', 'apothec'], ['fungus', 'alga', 'algae']], 'The alga photosynthesises and gives food to the fungus; the fungus absorbs and holds water and minerals and shelters the alga — both benefit (mutualism).', [['alga', 'photosynth', 'food'], ['fungus', 'water', 'mineral', 'protect', 'shelter'], ['mutual', 'both benefit', 'symbio']], 'width of the patch'),
    S('mistletoe', 'Mistletoe (Tapinanthus) on a host branch', ['mistletoe', 'tapinanthus', 'loranthus'], [['Host branch', 40, 142], ['Haustorium (swelling)', 100, 136], ['Mistletoe leaf', 98, 66]], null, 'Green leaves (it has chlorophyll); attached to the host branch by a swelling (haustorium); no roots in the soil; orange or red tubular flowers.', [['green', 'chlorophyll', 'leaf', 'leaves'], ['haustori', 'sucker', 'attach', 'swelling'], ['no root', 'host'], ['flower', 'orange', 'red']], 'Its haustoria grow into the host’s xylem to take water and mineral salts (a partial parasite); it makes its own food by photosynthesis.', [['haustori', 'penetrat', 'xylem'], ['water', 'mineral', 'salt'], ['partial', 'semi', 'photosynth']]),
    S('dodder', 'Dodder (Cuscuta) on a host stem', ['dodder', 'cuscuta'], [['Host stem', 30, 100], ['Dodder stem', 96, 76], ['Haustorium', 132, 100]], null, 'A yellow or orange, thread-like stem; no leaves (only tiny scales); no chlorophyll; twines round the host; haustoria; no roots.', [['yellow', 'orange', 'thread'], ['no leaf', 'leafless', 'scale'], ['no chlorophyll', 'not green'], ['twin', 'coil', 'wrap'], ['haustori', 'sucker']], 'Its haustoria grow into the host’s xylem and phloem to take food, water and salts (a total parasite), harming the host.', [['haustori', 'penetrat', 'phloem', 'xylem'], ['food', 'water', 'nutrient'], ['total', 'complete', 'harm']]),
    S('tapeworm', 'Tapeworm (Taenia)', ['tapeworm', 'tape worm', 'taenia'], [['Scolex', 24, 100], ['Neck', 46, 100], ['Proglottid (segment)', 142, 100]], [20, 40], 'A long, flat, ribbon-like body of segments (proglottids) that get bigger towards the end; a small scolex with hooks and suckers; no mouth or gut; white or cream.', [['flat', 'ribbon', 'tape', 'long'], ['segment', 'proglottid'], ['scolex', 'head'], ['hook', 'sucker'], ['no mouth', 'no gut', 'no alimentary']], 'Hooks and suckers attach it to the host’s intestine; it absorbs digested food through its whole surface; a thick cuticle resists the host’s enzymes; each proglottid has both sex organs and makes many eggs (parasitism).', [['hook', 'sucker', 'attach', 'grip'], ['absorb', 'surface', 'digested food'], ['cuticle', 'resist', 'enzyme', 'digestion'], ['egg', 'hermaphrod', 'reproduc', 'proglottid']], 'length of the piece in the jar'),
    S('tick', 'Tick', ['tick', 'ixodes', 'boophilus'], [['Mouthparts (capitulum)', 26, 100], ['Leg', 72, 146], ['Unsegmented body', 116, 100]], [0.4, 1], 'An oval, flattened, unsegmented body; four pairs of jointed legs (an arachnid); mouthparts with backward-pointing teeth; the body swells when full of blood.', [['oval', 'flat', 'unsegmented'], ['four pair', 'eight leg', '8 leg'], ['mouthpart', 'hypostome', 'teeth', 'barb'], ['swell', 'blood']], 'It sucks blood from its host (an ectoparasite), anchored by its toothed mouthparts; it carries diseases such as tick fever.', [['suck', 'blood', 'feed'], ['anchor', 'grip', 'attach', 'skin'], ['disease', 'fever', 'carrier', 'vector']]),

    // ---- vectors
    S('anopheles', 'Anopheles mosquito', ['anopheles'], [['Proboscis', 34, 142], ['Palps', 48, 128], ['Spotted wing', 112, 72]], null, 'Rests with its body at an angle (about 45°) to the surface; spotted (dark-patched) wings; the female’s palps are as long as the proboscis; long thin legs.', [['angle', '45', 'tilt', 'slant'], ['spot', 'dark', 'patch'], ['palp'], ['proboscis', 'long', 'thin']], 'The female pierces the skin with her proboscis, sucks blood and transmits Plasmodium, which causes malaria.', [['suck', 'blood', 'pierc'], ['malaria', 'plasmodium']], 'length including the proboscis'),
    S('culex', 'Culex mosquito', ['culex'], [['Proboscis', 26, 120], ['Short palp', 42, 112], ['Plain wing', 112, 80]], [0.5, 0.8], 'Rests with its body parallel to the surface (humped); plain, unspotted wings; the female’s palps much shorter than the proboscis; brownish.', [['parallel', 'hump', 'horizontal'], ['plain', 'unspotted', 'clear'], ['short palp', 'palp'], ['brown']], 'The female sucks blood and transmits Wuchereria, which causes filariasis (elephantiasis).', [['suck', 'blood', 'pierc'], ['filaria', 'elephantiasis', 'wuchereria']], 'length including the proboscis'),
    S('tsetse', 'Tsetse fly (Glossina)', ['tsetse', 'glossina'], [['Proboscis', 24, 100], ['Thorax', 80, 100], ['Wings folded like scissors', 150, 100]], [0.8, 1.4], 'Wings fold flat over the back like closed scissors and extend beyond the abdomen; a proboscis projecting forwards; brownish; a hatchet-shaped cell in the wing; larger than a housefly.', [['scissor', 'fold', 'overlap'], ['proboscis', 'forward', 'project'], ['brown'], ['hatchet'], ['large', 'bigger']], 'Both sexes suck blood and transmit Trypanosoma, which causes sleeping sickness.', [['suck', 'blood', 'pierc'], ['sleeping', 'trypanosom']], 'length from the proboscis to the wing tips'),
    S('simulium', 'Blackfly (Simulium)', ['simulium', 'blackfly', 'black fly'], [['Antenna', 26, 86], ['Humped thorax', 80, 66], ['Wing', 136, 92]], [0.2, 0.5], 'Very small and black; a strongly humped thorax; short, broad, clear wings; short horn-like antennae.', [['small', 'tiny'], ['black', 'dark'], ['hump'], ['broad', 'short wing', 'clear wing'], ['antenna', 'short']], 'The female bites and sucks blood and transmits Onchocerca, which causes river blindness; it breeds in fast-flowing rivers.', [['bite', 'suck', 'blood'], ['river blindness', 'onchocerc'], ['fast', 'river', 'stream', 'flowing']]),

    // ---- pests
    S('weevil', 'Maize weevil (Sitophilus)', ['weevil', 'sitophilus', 'callosobruchus'], [['Snout (rostrum)', 28, 100], ['Elbowed antenna', 52, 76], ['Elytra', 130, 100]], [0.25, 0.45], 'A small, dark brown beetle; a long snout (rostrum) with biting mouthparts at its tip; elbowed antennae; hard forewings (elytra) with four reddish spots.', [['small', 'dark', 'brown', 'beetle'], ['snout', 'rostrum'], ['elbow', 'antenna'], ['elytra', 'hard wing', 'forewing'], ['spot']], 'It bores into stored grain and eats the endosperm; it lays its eggs inside the grains; damaged grain has exit holes and powder.', [['bore', 'hole', 'eat', 'tunnel'], ['stored', 'grain', 'maize', 'store'], ['egg', 'lay', 'larva']]),
    S('cotton-stainer', 'Cotton stainer (Dysdercus)', ['cotton stainer', 'dysdercus', 'stainer'], [['Antenna', 30, 68], ['Red body', 80, 100], ['Black spot on wing', 122, 92]], [1.2, 1.8], 'A bright red body with black and white bands; piercing and sucking mouthparts (rostrum) folded under the body; half-hard forewings with black spots; long antennae.', [['red', 'bright'], ['black', 'white', 'band', 'spot'], ['pierc', 'suck', 'rostrum', 'beak'], ['wing'], ['antenna']], 'It pierces cotton bolls and sucks sap from the seeds, and the lint is stained by its excreta and by fungi, lowering its quality.', [['pierc', 'suck', 'sap'], ['boll', 'seed', 'cotton'], ['stain', 'lint', 'quality', 'fungus']]),
    S('stem-borer', 'Stem borer larva in a maize stem', ['stem borer', 'borer', 'busseola', 'sesamia'], [['Tunnel', 58, 100], ['Larva (caterpillar)', 104, 100], ['Frass', 152, 108]], null, 'A cream or pinkish caterpillar with dark spots; biting mouthparts; prolegs; it lives in a tunnel inside the maize stem, with frass (droppings) in the tunnel.', [['caterpillar', 'larva', 'cream', 'pink'], ['spot', 'dark'], ['biting', 'chewing', 'mandible'], ['proleg', 'leg'], ['tunnel', 'bore', 'frass']], 'It bores and tunnels inside the stem eating the tissues, causing “dead heart”, weak stems that break and a low yield.', [['tunnel', 'bore', 'eat'], ['dead heart', 'wilt', 'die'], ['break', 'lodg', 'weak', 'yield']]),
    S('yam-beetle', 'Yam beetle (Heteroligus)', ['yam beetle', 'heteroligus', 'beetle'], [['Head', 30, 100], ['Digging leg', 60, 150], ['Elytra', 122, 100]], [2.5, 3.5], 'A stout, black or dark brown beetle; hard, shiny elytra covering the hind wings; strong, spiny legs for digging; biting mouthparts.', [['stout', 'black', 'dark', 'shiny'], ['elytra', 'hard wing'], ['spiny', 'strong leg', 'digging'], ['biting', 'chewing', 'mandible']], 'Adults burrow into the soil and eat holes in yam tubers, which then rot, so setts and stored yams are lost.', [['hole', 'burrow', 'bore', 'eat'], ['tuber', 'yam'], ['rot', 'decay', 'loss']]),
    S('termite', 'Termite (soldier)', ['termite', 'white ant'], [['Mandibles', 24, 100], ['Head', 48, 100], ['Soft abdomen', 140, 100]], [0.5, 1], 'A soft, pale whitish body; a large brown head with strong biting mandibles; no wings; thorax and abdomen broadly joined (no narrow waist); short beaded antennae.', [['soft', 'pale', 'white'], ['head', 'brown'], ['mandible', 'jaw', 'biting'], ['wingless', 'no wing'], ['no waist', 'broad']], 'Termites eat wood, roots and stems of crops (cellulose is digested by protozoa in their gut), destroying crops and buildings.', [['eat', 'wood', 'cellulose', 'chew'], ['root', 'stem', 'crop', 'destroy', 'damage']]),

    // ---- vegetative organs
    S('onion-bulb', 'Onion bulb (L.S.)', ['onion', 'bulb'], [['Fleshy scale leaf', 58, 92], ['Terminal bud', 100, 96], ['Stem (disc)', 100, 160], ['Adventitious roots', 100, 186]], null, 'A short, flat, disc-shaped stem; fleshy scale leaves (leaf bases) storing food; dry, papery outer scale leaves; a terminal bud; adventitious roots from the disc.', [['disc', 'short stem', 'flat stem'], ['fleshy', 'scale', 'leaf base'], ['dry', 'papery', 'outer'], ['bud', 'terminal'], ['adventitious', 'root']], 'Food is stored in the fleshy scale leaves; the terminal and axillary buds grow into new plants (vegetative reproduction and perennation).', [['store', 'food'], ['bud', 'new plant', 'grow', 'reproduc', 'propagat']]),
    S('ginger', 'Ginger rhizome', ['ginger', 'rhizome'], [['Node with scale leaf', 70, 100], ['Bud', 132, 64], ['Adventitious root', 100, 144]], [8, 14], 'A horizontal, swollen, branched underground stem; nodes and internodes with scale leaves; buds; adventitious roots; aromatic.', [['horizontal', 'underground'], ['node', 'internode', 'ring'], ['scale'], ['bud'], ['adventitious', 'root'], ['swollen', 'branch']], 'Stores food; buds at the nodes grow into new shoots (vegetative propagation).', [['store', 'food'], ['bud', 'new shoot', 'new plant', 'propagat']]),
    S('cocoyam', 'Cocoyam corm', ['cocoyam', 'corm', 'taro', 'colocasia', 'xanthosoma'], [['Terminal bud', 100, 34], ['Ring of scale leaves', 100, 100], ['Cormel', 164, 132], ['Adventitious root', 100, 184]], null, 'A short, swollen, vertical underground stem; rings of scale leaves at the nodes; a terminal bud at the top; small cormels at the side; adventitious roots at the base.', [['vertical', 'short', 'swollen'], ['ring', 'scale', 'node'], ['bud', 'terminal'], ['cormel', 'daughter'], ['root']], 'Stores food (starch); the terminal bud and cormels grow into new plants.', [['store', 'food', 'starch'], ['bud', 'cormel', 'new plant', 'propagat']]),
    S('irish-potato', 'Irish potato (stem tuber)', ['irish potato', 'potato', 'stem tuber'], [['Heel (stolon scar)', 22, 100], ['Eye (bud)', 80, 80], ['Rose end (apical buds)', 172, 94]], [5, 9], 'The swollen tip of an underground stem (stolon); eyes — buds in the axils of scale-leaf scars — arranged spirally; a heel end where it was attached; a thin skin that turns green in light.', [['stem tuber', 'swollen', 'stolon'], ['eye', 'bud'], ['scale', 'scar', 'eyebrow'], ['heel', 'attach'], ['green', 'skin']], 'Stores starch; each eye can grow into a new plant (pieces with eyes are planted).', [['store', 'starch', 'food'], ['eye', 'bud', 'new plant', 'propagat', 'sprout']]),
    S('sweet-potato', 'Sweet potato (root tuber)', ['sweet potato', 'ipomoea', 'root tuber'], [['Stem end', 22, 100], ['Swollen root', 100, 100], ['Fibrous rootlets', 120, 142]], [10, 20], 'A swollen adventitious root (root tuber) tapering at both ends; no nodes, eyes or scale leaves; thin fibrous rootlets on its surface; buds only at the stem end.', [['root tuber', 'swollen root', 'adventitious'], ['taper', 'spindle'], ['no node', 'no eye', 'no bud', 'no scale'], ['fibrous', 'root hair', 'rootlet'], ['stem end', 'proximal']], 'Stores starch; it can sprout shoots from the stem end, but it is mainly propagated by vine cuttings.', [['store', 'starch', 'food'], ['shoot', 'vine', 'cutting', 'new plant', 'propagat']]),
    S('bryophyllum', 'Bryophyllum leaf', ['bryophyllum', 'kalanchoe', 'resurrection plant', 'life plant'], [['Petiole', 22, 100], ['Plantlet', 60, 48], ['Notch in the margin', 132, 60]], [8, 14], 'A thick, fleshy (succulent) leaf with a notched (crenate) margin; tiny plantlets with roots growing from the notches.', [['thick', 'fleshy', 'succulent'], ['notch', 'crenate', 'scallop', 'margin'], ['plantlet', 'bud', 'tiny plant']], 'Plantlets grow from adventitious buds in the notches, fall off and grow into new plants (vegetative reproduction by leaves).', [['plantlet', 'bud', 'new plant', 'grow', 'reproduc', 'propagat']]),
  ].map((s) => [s.id, s.id === 'heart' ? { ...s, vertical: true } : s]),
);

export const SPECIMEN_SETS = ['KINGDOMS', 'VERTEBRAE', 'LIMBS', 'HEART', 'KIDNEY', 'EYE', 'FLOWER', 'POLLINATION', 'FRUITS', 'DISPERSAL', 'DENTITION', 'HABITAT', 'METAMORPHOSIS', 'ASSOCIATIONS', 'VECTORS', 'PESTS', 'VEGETATIVE'] as const;
export type SpecimenSet = (typeof SPECIMEN_SETS)[number];

export interface SpecimenSetDef {
  title: string;
  /** The classification question and its options; `answers` per specimen id. */
  classify: { question: string; options: string[]; answers: Record<string, string> };
  /** Specimens that are always on the bench. */
  required: string[];
  /** Comparison pairs: one is put on the bench and compared. */
  pairs: [string, string][];
  /** Specimens on the bench. */
  count: number;
}

const ORGAN_SYSTEMS = ['Circulatory system', 'Excretory system', 'Nervous system (sense organ)', 'Respiratory system', 'Digestive system'];
const organs = { heart: 'Circulatory system', 'heart-ls': 'Circulatory system', artery: 'Circulatory system', vein: 'Circulatory system', kidney: 'Excretory system', 'kidney-ls': 'Excretory system', eye: 'Nervous system (sense organ)', 'eye-front': 'Nervous system (sense organ)' };

export const SPECIMEN_SET_INFO: Record<SpecimenSet, SpecimenSetDef> = {
  KINGDOMS: {
    title: 'Specimens from the kingdoms',
    classify: { question: 'Kingdom and phylum/division', options: ['Fungi', 'Plantae – Bryophyta', 'Plantae – Filicinophyta (ferns)', 'Animalia – Annelida', 'Animalia – Mollusca', 'Animalia – Arthropoda', 'Animalia – Chordata'], answers: { mushroom: 'Fungi', rhizopus: 'Fungi', moss: 'Plantae – Bryophyta', fern: 'Plantae – Filicinophyta (ferns)', earthworm: 'Animalia – Annelida', snail: 'Animalia – Mollusca', cockroach: 'Animalia – Arthropoda', toad: 'Animalia – Chordata', tilapia: 'Animalia – Chordata' } },
    required: [],
    pairs: [['mushroom', 'fern'], ['moss', 'fern'], ['earthworm', 'snail'], ['cockroach', 'earthworm'], ['toad', 'tilapia'], ['mushroom', 'rhizopus']],
    count: 5,
  },
  VERTEBRAE: {
    title: 'Mammalian vertebrae',
    classify: { question: 'Region of the vertebral column', options: ['Cervical', 'Thoracic', 'Lumbar', 'Sacral', 'Caudal'], answers: { atlas: 'Cervical', axis: 'Cervical', cervical: 'Cervical', thoracic: 'Thoracic', lumbar: 'Lumbar', sacrum: 'Sacral', caudal: 'Caudal' } },
    required: [],
    pairs: [['thoracic', 'lumbar'], ['atlas', 'axis'], ['cervical', 'thoracic'], ['lumbar', 'sacrum']],
    count: 4,
  },
  LIMBS: {
    title: 'Limb bones and girdles',
    classify: { question: 'Part of the skeleton', options: ['Fore limb', 'Hind limb', 'Pectoral girdle', 'Pelvic girdle'], answers: { humerus: 'Fore limb', 'radius-ulna': 'Fore limb', femur: 'Hind limb', 'tibia-fibula': 'Hind limb', scapula: 'Pectoral girdle', 'pelvic-girdle': 'Pelvic girdle' } },
    required: [],
    pairs: [['humerus', 'femur'], ['scapula', 'pelvic-girdle'], ['radius-ulna', 'tibia-fibula']],
    count: 4,
  },
  HEART: {
    title: 'The mammalian heart and blood vessels',
    classify: { question: 'Organ system', options: ORGAN_SYSTEMS, answers: organs },
    required: ['heart', 'heart-ls'],
    pairs: [['artery', 'vein']],
    count: 4,
  },
  KIDNEY: {
    title: 'The mammalian kidney',
    classify: { question: 'Organ system', options: ORGAN_SYSTEMS, answers: organs },
    required: ['kidney', 'kidney-ls'],
    pairs: [['kidney', 'heart'], ['kidney-ls', 'heart-ls']],
    count: 3,
  },
  EYE: {
    title: 'The mammalian eye',
    classify: { question: 'Organ system', options: ORGAN_SYSTEMS, answers: organs },
    required: ['eye', 'eye-front'],
    pairs: [['eye', 'kidney-ls'], ['eye', 'heart-ls']],
    count: 3,
  },
  FLOWER: {
    title: 'Structure of flowers',
    classify: { question: 'Symmetry of the flower', options: ['Actinomorphic (radially symmetrical)', 'Zygomorphic (bilaterally symmetrical)'], answers: { hibiscus: 'Actinomorphic (radially symmetrical)', 'hibiscus-ls': 'Actinomorphic (radially symmetrical)', allamanda: 'Actinomorphic (radially symmetrical)', caesalpinia: 'Zygomorphic (bilaterally symmetrical)', crotalaria: 'Zygomorphic (bilaterally symmetrical)' } },
    required: ['hibiscus-ls'],
    pairs: [['hibiscus', 'caesalpinia'], ['hibiscus', 'crotalaria'], ['allamanda', 'crotalaria']],
    count: 4,
  },
  POLLINATION: {
    title: 'Insect- and wind-pollinated flowers',
    classify: { question: 'Agent of pollination', options: ['Insect-pollinated', 'Wind-pollinated'], answers: { hibiscus: 'Insect-pollinated', crotalaria: 'Insect-pollinated', allamanda: 'Insect-pollinated', caesalpinia: 'Insect-pollinated', 'maize-tassel': 'Wind-pollinated', 'grass-flower': 'Wind-pollinated' } },
    required: [],
    pairs: [['hibiscus', 'grass-flower'], ['allamanda', 'maize-tassel'], ['crotalaria', 'grass-flower']],
    count: 4,
  },
  FRUITS: {
    title: 'Classification of fruits',
    classify: { question: 'Type of fruit', options: ['Berry', 'Hesperidium', 'Drupe', 'Legume', 'Capsule', 'Caryopsis', 'False fruit', 'Multiple fruit'], answers: { tomato: 'Berry', orange: 'Hesperidium', mango: 'Drupe', coconut: 'Drupe', 'cowpea-pod': 'Legume', okra: 'Capsule', 'maize-grain': 'Caryopsis', cashew: 'False fruit', pineapple: 'Multiple fruit' } },
    required: [],
    pairs: [['tomato', 'mango'], ['mango', 'coconut'], ['cowpea-pod', 'okra'], ['orange', 'tomato'], ['cashew', 'mango']],
    count: 5,
  },
  DISPERSAL: {
    title: 'Dispersal of fruits and seeds',
    classify: { question: 'Agent of dispersal', options: ['Wind', 'Water', 'Animals', 'Self (explosive)'], answers: { tridax: 'Wind', combretum: 'Wind', desmodium: 'Animals', coconut: 'Water', mango: 'Animals', tomato: 'Animals', 'cowpea-pod': 'Self (explosive)' } },
    required: [],
    pairs: [['tridax', 'combretum'], ['coconut', 'mango'], ['desmodium', 'tridax'], ['cowpea-pod', 'combretum']],
    count: 4,
  },
  DENTITION: {
    title: 'Teeth and skulls',
    classify: { question: 'Main use or diet it shows', options: ['Cutting and biting', 'Holding and tearing', 'Crushing and grinding', 'Carnivorous diet', 'Herbivorous diet'], answers: { incisor: 'Cutting and biting', canine: 'Holding and tearing', premolar: 'Crushing and grinding', molar: 'Crushing and grinding', 'dog-skull': 'Carnivorous diet', 'goat-skull': 'Herbivorous diet' } },
    required: [],
    pairs: [['dog-skull', 'goat-skull'], ['incisor', 'molar'], ['canine', 'premolar']],
    count: 4,
  },
  HABITAT: {
    title: 'Adaptations to habitats',
    classify: { question: 'Habitat it is adapted to', options: ['Aquatic – swimming', 'Aquatic – floating', 'Dry land (arid)', 'Both land and water'], answers: { tilapia: 'Aquatic – swimming', 'water-lettuce': 'Aquatic – floating', 'water-lily': 'Aquatic – floating', opuntia: 'Dry land (arid)', agama: 'Dry land (arid)', toad: 'Both land and water' } },
    required: [],
    pairs: [['opuntia', 'water-lettuce'], ['tilapia', 'toad'], ['toad', 'agama'], ['water-lily', 'opuntia']],
    count: 4,
  },
  METAMORPHOSIS: {
    title: 'Insect life cycles',
    classify: { question: 'Stage in the life cycle', options: ['Egg', 'Larva', 'Pupa', 'Nymph', 'Adult'], answers: { maggot: 'Larva', pupa: 'Pupa', housefly: 'Adult', 'cockroach-nymph': 'Nymph', cockroach: 'Adult', grasshopper: 'Adult' } },
    required: [],
    pairs: [['maggot', 'pupa'], ['cockroach-nymph', 'cockroach'], ['housefly', 'cockroach'], ['maggot', 'cockroach-nymph']],
    count: 4,
  },
  ASSOCIATIONS: {
    title: 'Biological associations',
    classify: { question: 'Type of association', options: ['Mutualism (symbiosis)', 'Parasitism', 'Commensalism', 'Saprophytism'], answers: { 'root-nodules': 'Mutualism (symbiosis)', lichen: 'Mutualism (symbiosis)', mistletoe: 'Parasitism', dodder: 'Parasitism', tapeworm: 'Parasitism', tick: 'Parasitism', mushroom: 'Saprophytism' } },
    required: [],
    pairs: [['mistletoe', 'dodder'], ['root-nodules', 'lichen'], ['tapeworm', 'tick']],
    count: 4,
  },
  VECTORS: {
    title: 'Vectors of disease',
    classify: { question: 'Disease it transmits', options: ['Malaria', 'Filariasis (elephantiasis)', 'Typhoid, cholera and dysentery', 'Sleeping sickness', 'River blindness', 'Schistosomiasis (bilharzia)'], answers: { anopheles: 'Malaria', culex: 'Filariasis (elephantiasis)', housefly: 'Typhoid, cholera and dysentery', cockroach: 'Typhoid, cholera and dysentery', tsetse: 'Sleeping sickness', simulium: 'River blindness', snail: 'Schistosomiasis (bilharzia)' } },
    required: [],
    pairs: [['anopheles', 'culex'], ['housefly', 'tsetse'], ['anopheles', 'tsetse']],
    count: 4,
  },
  PESTS: {
    title: 'Pests of crops and stored produce',
    classify: { question: 'Type of pest', options: ['Field pest – biting and chewing', 'Field pest – piercing and sucking', 'Storage pest'], answers: { grasshopper: 'Field pest – biting and chewing', weevil: 'Storage pest', 'cotton-stainer': 'Field pest – piercing and sucking', 'stem-borer': 'Field pest – biting and chewing', 'yam-beetle': 'Field pest – biting and chewing', termite: 'Field pest – biting and chewing' } },
    required: [],
    pairs: [['weevil', 'grasshopper'], ['cotton-stainer', 'grasshopper'], ['stem-borer', 'yam-beetle']],
    count: 4,
  },
  VEGETATIVE: {
    title: 'Organs of vegetative reproduction',
    classify: { question: 'Type of organ', options: ['Bulb', 'Rhizome', 'Corm', 'Stem tuber', 'Root tuber', 'Leaf'], answers: { 'onion-bulb': 'Bulb', ginger: 'Rhizome', cocoyam: 'Corm', 'irish-potato': 'Stem tuber', 'sweet-potato': 'Root tuber', bryophyllum: 'Leaf' } },
    required: [],
    pairs: [['irish-potato', 'sweet-potato'], ['onion-bulb', 'cocoyam'], ['ginger', 'irish-potato']],
    count: 4,
  },
};

/** The lessons that open this lab, and the set of specimens each one uses. */
export const SPECIMEN_PRACTICAL_SETS: Record<string, SpecimenSet> = {
  'pr-bio-kingdom-specimens': 'KINGDOMS',
  'pr-bio-vertebrae': 'VERTEBRAE',
  'pr-bio-limb-bones-joints': 'LIMBS',
  'pr-bio-mammalian-heart': 'HEART',
  'pr-bio-kidney': 'KIDNEY',
  'pr-bio-eye-blind-spot': 'EYE',
  'pr-bio-flower-structure': 'FLOWER',
  'pr-bio-pollination-flowers': 'POLLINATION',
  'pr-bio-fruits': 'FRUITS',
  'pr-bio-seed-dispersal': 'DISPERSAL',
  'pr-bio-dental-formula': 'DENTITION',
  'pr-bio-habitat-adaptations': 'HABITAT',
  'pr-bio-housefly-life-cycle': 'METAMORPHOSIS',
  'pr-bio-biological-associations': 'ASSOCIATIONS',
  'pr-bio-disease-vectors': 'VECTORS',
  'pr-bio-crop-pests': 'PESTS',
  'pr-bio-vegetative-organs': 'VEGETATIVE',
};

export const SPECIMEN_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface BenchSpecimen {
  letter: string;
  id: string;
  def: SpecimenDef;
  classification: string;
  /** Label chips offered for this specimen: its parts and one distractor, seeded order. */
  labelOptions: string[];
}

export interface BioSpecimensVariant {
  seed: number;
  set: SpecimenSet;
  info: SpecimenSetDef;
  specimens: BenchSpecimen[];
  /** Indexes into `specimens` of the two to compare. */
  compare: [number, number];
  /** Index into `specimens` of the one measured and drawn. */
  measured: number;
  /** Its real length (cm). */
  trueLength: number;
  /** Reading tolerance (cm) for full marks. */
  lengthTol: number;
  /** The paper: "your drawing of specimen X is … cm long". */
  drawingLength: number;
  drawing: BioDrawingStatement[];
}

const shuffle = <T>(r: () => number, xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

/** The members of a set (every specimen its classification covers). */
export const specimenSetMembers = (set: SpecimenSet) => Object.keys(SPECIMEN_SET_INFO[set].classify.answers);

/** The hidden truth of one attempt (same on the web and the API). */
export function bioSpecimensVariant(seed: number, set: SpecimenSet): BioSpecimensVariant {
  const r = labRandom(seed, `bio-specimens-${set}`);
  const info = SPECIMEN_SET_INFO[set];
  const members = specimenSetMembers(set);
  const pair = labPick(r, info.pairs);
  const chosen = [...new Set([...pair, ...info.required])];
  for (const id of shuffle(r, members)) if (chosen.length < info.count && !chosen.includes(id)) chosen.push(id);
  // At least one specimen that can be measured.
  if (!chosen.some((id) => SPECIMENS[id]!.lengthCm)) {
    const m = shuffle(r, members).find((id) => SPECIMENS[id]!.lengthCm && !chosen.includes(id));
    const k = chosen.findIndex((id) => !pair.includes(id) && !info.required.includes(id));
    if (m && k >= 0) chosen[k] = m;
    else if (m) chosen.push(m);
  }
  const order = shuffle(r, chosen);
  const specimens: BenchSpecimen[] = order.map((id, i) => {
    const def = SPECIMENS[id]!;
    const others = order.filter((o) => o !== id).flatMap((o) => SPECIMENS[o]!.parts.map((p) => p.label));
    const own = def.parts.map((p) => p.label);
    const distractor = labPick(r, others.filter((l) => !own.includes(l)).length ? others.filter((l) => !own.includes(l)) : ['Cell wall']);
    return { letter: SPECIMEN_LETTERS[i]!, id, def, classification: info.classify.answers[id]!, labelOptions: shuffle(r, [...own, distractor]) };
  });
  const compare: [number, number] = [order.indexOf(pair[0]), order.indexOf(pair[1])].sort((a, b) => a - b) as [number, number];
  const measurable = specimens.map((s, i) => (s.def.lengthCm ? i : -1)).filter((i) => i >= 0);
  const measured = labPick(r, measurable);
  const [lo, hi] = specimens[measured]!.def.lengthCm!;
  const trueLength = labBetween(r, lo, hi, hi < 2 ? 2 : 1);
  const lengthTol = roundDp(Math.max(trueLength < 2 ? 0.05 : 0.1, trueLength * 0.03), 2);
  const drawingLength = labBetween(r, 8, 12, 1);
  return { seed, set, info, specimens, compare, measured, trueLength, lengthTol, drawingLength, drawing: bioDrawingPick(seed, 'bio-specimens') };
}

/** Whether a written name identifies the specimen (and does not hedge with another specimen's name). */
export function specimenNameMatches(v: BioSpecimensVariant, index: number, written: string): boolean {
  const a = bioNormalise(written);
  if (!a.trim()) return false;
  // The most specific (longest) alias of each bench specimen found in the answer.
  const found = v.specimens.map((s) => s.def.aliases.map(bioNormalise).filter((al) => a.includes(al)).sort((x, y) => y.length - x.length)[0] ?? null);
  const mine = found[index];
  if (!mine) return false;
  const me = v.specimens[index]!;
  return v.specimens.every((s, i) => {
    const other = found[i];
    if (i === index || !other || s.id === me.id) return true;
    // Mine is the more specific name ("sweet potato" over "potato"), or both name the same thing.
    if (mine.includes(other) && mine !== other) return true;
    if (mine === other || me.def.aliases.map(bioNormalise).includes(other)) return true;
    // The answer names the other specimen more specifically ("cockroach nymph"), or hedges ("thoracic or lumbar").
    return false;
  });
}

// ------------------------------------------------------------------ the student's work

export interface SpecimenEntry {
  name: string;
  classification: string;
  /** Label chosen for each part (same order as the specimen's parts). */
  labels: string[];
  features: string;
  functions: string;
}
export interface SpecimenAnswer {
  value: string;
  unit: string;
}
export interface BioSpecimensState {
  v: 1;
  /** The set (from the lesson, or chosen by the student). */
  set: SpecimenSet | null;
  /** Letters of the specimens examined with the hand lens. */
  examined: string[];
  /** One per specimen, in bench order. */
  entries: SpecimenEntry[];
  measure: { length: SpecimenAnswer; magnification: SpecimenAnswer };
  compare: { similarities: string; differences: string };
  drawing: string[];
  log: { t: number; a: string }[];
}

export const emptySpecimenEntry = (): SpecimenEntry => ({ name: '', classification: '', labels: [], features: '', functions: '' });
export function emptyBioSpecimensState(): BioSpecimensState {
  return { v: 1, set: null, examined: [], entries: [], measure: { length: { value: '', unit: '' }, magnification: { value: '', unit: '' } }, compare: { similarities: '', differences: '' }, drawing: [], log: [] };
}

const short = z.string().max(40);
export const bioSpecimensStateSchema = z.object({
  v: z.literal(1),
  set: z.enum(SPECIMEN_SETS).nullable(),
  examined: z.array(z.string().max(2)).max(5),
  entries: z.array(z.object({ name: z.string().max(80), classification: z.string().max(80), labels: z.array(z.string().max(60)).max(6), features: z.string().max(1000), functions: z.string().max(1000) })).max(5),
  measure: z.object({ length: z.object({ value: short, unit: short }), magnification: z.object({ value: short, unit: short }) }),
  compare: z.object({ similarities: z.string().max(1500), differences: z.string().max(1500) }),
  drawing: z.array(z.string().max(20)).max(20),
  log: z.array(z.object({ t: z.number().min(0), a: z.string().max(80) })).max(600),
}) satisfies z.ZodType<BioSpecimensState>;

export const BIO_SPECIMENS: SimulatorSpec = {
  id: 'bio-specimens',
  subject: 'Biology',
  title: 'Specimen bench',
  topicNames: ['Classification into Kingdoms', 'Skeleton and supporting systems in animals', 'Transport in animals', 'Kidney: structure and functions', 'Eye', 'Floral parts', 'Pollination in plants', 'Fruits', 'Dispersal of fruits and seeds', 'Dental formula', 'Adaptation of organisms to habitats', 'Metamorphosis in insects', 'Biological associations', 'Carriers of microorganisms', 'Control of pests', 'Types of reproduction'],
  minutes: 45,
  rubric: [
    { id: 'identification', label: 'Identification', marks: 5, how: 'AUTO', guide: 'Each specimen named correctly (common or scientific name; one name only — hedging between two names earns nothing). Marks shared between the specimens.' },
    { id: 'classification', label: 'Classification', marks: 4, how: 'AUTO', guide: 'Each specimen placed in the right group (kingdom/phylum, region, type of fruit, agent, stage, association, disease …). Marks shared between the specimens.' },
    { id: 'labels', label: 'Labelling', marks: 4, how: 'AUTO', guide: 'Each part on the drawings labelled correctly. Marks shared between all the parts.' },
    { id: 'measurement', label: 'Measurement and magnification', marks: 3, how: 'AUTO', guide: 'The length read from the ruler within ±3 % (or ±1 mm) of the specimen (2; 1 within twice that); the magnification of the drawing = drawing length ÷ actual length, in the same units, from your own measurement (1).' },
    { id: 'units', label: 'Units', marks: 1, how: 'AUTO', guide: 'The length with its unit (cm or mm); the magnification as a number or with ×, never with a unit.' },
    { id: 'drawing', label: 'Biological drawing practice', marks: 2, how: 'AUTO', guide: 'Every statement about drawing practice judged correctly (2; 1 with one slip): title, magnification, clean continuous lines, ruled label lines that do not cross and have no arrowheads, labels to the side, no shading.' },
    { id: 'features', label: 'Observable features', marks: 4, how: 'AI', guide: 'Two observable features for each specimen (what can be seen: shape, parts, colour, texture, numbers of parts) — not functions or names.' },
    { id: 'functions', label: 'Functions and adaptations', marks: 3, how: 'AI', guide: 'One correct function, adaptation or economic importance for each specimen, linked to a structure.' },
    { id: 'comparison', label: 'Comparison', marks: 4, how: 'AI', guide: 'Two similarities (2) and two differences (2) between the two named specimens, based on features that can be observed; each difference states both sides.' },
  ],
};
