/**
 * GlobalDeets World Map - Webcam Data
 * Curated collection of live webcam feeds worldwide
 *
 * Data structure for each webcam:
 * - id: unique identifier
 * - name: display name
 * - location: city, country
 * - coordinates: [latitude, longitude]
 * - region: continent
 * - category: type of webcam
 * - streamUrl: embed URL for the livestream
 * - sourceUrl: external link to source
 * - timezone: IANA timezone identifier
 * - isLive: boolean indicating if currently streaming
 * - quality: HD, 4K, SD
 * - description: additional info
 */

const WEBCAM_DATA = [
  // North America
  {
    id: 'nyc-times-square',
    name: 'Times Square',
    location: 'New York City, USA',
    coordinates: [40.758, -73.9855],
    region: 'north-america',
    category: 'city',
    streamUrl: 'https://www.earthcam.com/cams/newyork/timessquare/?cam=tsstreet',
    sourceUrl: 'https://www.earthcam.com/usa/newyork/timessquare/',
    timezone: 'America/New_York',
    isLive: true,
    quality: '4K',
    description: 'Live view of the iconic Times Square in Manhattan',
  },
  {
    id: 'sf-golden-gate',
    name: 'Golden Gate Bridge',
    location: 'San Francisco, USA',
    coordinates: [37.8199, -122.4783],
    region: 'north-america',
    category: 'landmark',
    streamUrl: 'https://www.earthcam.com/usa/california/sanfrancisco/goldengate/',
    sourceUrl: 'https://www.earthcam.com/usa/california/sanfrancisco/goldengate/',
    timezone: 'America/Los_Angeles',
    isLive: true,
    quality: 'HD',
    description: 'View of the iconic Golden Gate Bridge',
  },
  {
    id: 'miami-south-beach',
    name: 'South Beach',
    location: 'Miami, USA',
    coordinates: [25.7907, -80.13],
    region: 'north-america',
    category: 'beach',
    streamUrl: 'https://www.earthcam.com/usa/florida/miamibeach/',
    sourceUrl: 'https://www.earthcam.com/usa/florida/miamibeach/',
    timezone: 'America/New_York',
    isLive: true,
    quality: 'HD',
    description: "Beautiful view of Miami's South Beach",
  },
  {
    id: 'chicago-skyline',
    name: 'Chicago Skyline',
    location: 'Chicago, USA',
    coordinates: [41.8781, -87.6298],
    region: 'north-america',
    category: 'city',
    streamUrl: 'https://www.earthcam.com/usa/illinois/chicago/',
    sourceUrl: 'https://www.earthcam.com/usa/illinois/chicago/',
    timezone: 'America/Chicago',
    isLive: true,
    quality: 'HD',
    description: 'Panoramic view of Chicago skyline',
  },

  // Europe
  {
    id: 'london-trafalgar',
    name: 'Trafalgar Square',
    location: 'London, UK',
    coordinates: [51.508, -0.1281],
    region: 'europe',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/united-kingdom/england/london/trafalgar-square.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/united-kingdom/england/london/trafalgar-square.html',
    timezone: 'Europe/London',
    isLive: true,
    quality: 'HD',
    description: 'Historic Trafalgar Square in central London',
  },
  {
    id: 'paris-eiffel',
    name: 'Eiffel Tower',
    location: 'Paris, France',
    coordinates: [48.8584, 2.2945],
    region: 'europe',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris/tour-eiffel.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/france/ile-de-france/paris/tour-eiffel.html',
    timezone: 'Europe/Paris',
    isLive: true,
    quality: '4K',
    description: 'Live view of the iconic Eiffel Tower',
  },
  {
    id: 'rome-colosseum',
    name: 'Colosseum',
    location: 'Rome, Italy',
    coordinates: [41.8902, 12.4922],
    region: 'europe',
    category: 'landmark',
    streamUrl: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html',
    sourceUrl: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html',
    timezone: 'Europe/Rome',
    isLive: true,
    quality: 'HD',
    description: 'Ancient Roman Colosseum',
  },
  {
    id: 'venice-rialto',
    name: 'Rialto Bridge',
    location: 'Venice, Italy',
    coordinates: [45.438, 12.3358],
    region: 'europe',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/ponte-di-rialto.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/ponte-di-rialto.html',
    timezone: 'Europe/Rome',
    isLive: true,
    quality: 'HD',
    description: 'Famous Rialto Bridge in Venice',
  },
  {
    id: 'amsterdam-dam-square',
    name: 'Dam Square',
    location: 'Amsterdam, Netherlands',
    coordinates: [52.373, 4.8924],
    region: 'europe',
    category: 'city',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/nederland/noord-holland/amsterdam/dam-square.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/nederland/noord-holland/amsterdam/dam-square.html',
    timezone: 'Europe/Amsterdam',
    isLive: true,
    quality: 'HD',
    description: 'Central Dam Square in Amsterdam',
  },

  // Asia
  {
    id: 'tokyo-shibuya',
    name: 'Shibuya Crossing',
    location: 'Tokyo, Japan',
    coordinates: [35.6595, 139.7004],
    region: 'asia',
    category: 'city',
    streamUrl: 'https://www.youtube.com/embed/live_stream?channel=UCWYJfTx17RQ8KVl7IBwr8Vw',
    sourceUrl: 'https://www.youtube.com/watch?v=live_stream?channel=UCWYJfTx17RQ8KVl7IBwr8Vw',
    timezone: 'Asia/Tokyo',
    isLive: true,
    quality: 'HD',
    description: 'Busiest pedestrian crossing in the world',
  },
  {
    id: 'dubai-burj-khalifa',
    name: 'Burj Khalifa',
    location: 'Dubai, UAE',
    coordinates: [25.1972, 55.2744],
    region: 'asia',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/burj-khalifa.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/united-arab-emirates/dubai/dubai/burj-khalifa.html',
    timezone: 'Asia/Dubai',
    isLive: true,
    quality: '4K',
    description: "World's tallest building",
  },
  {
    id: 'singapore-marina-bay',
    name: 'Marina Bay',
    location: 'Singapore',
    coordinates: [1.2864, 103.8545],
    region: 'asia',
    category: 'city',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/singapore/singapore/singapore/marina-bay.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/singapore/singapore/singapore/marina-bay.html',
    timezone: 'Asia/Singapore',
    isLive: true,
    quality: 'HD',
    description: 'Iconic Marina Bay skyline',
  },
  {
    id: 'bali-beach',
    name: 'Kuta Beach',
    location: 'Bali, Indonesia',
    coordinates: [-8.7184, 115.1682],
    region: 'asia',
    category: 'beach',
    streamUrl: 'https://www.skylinewebcams.com/en/webcam/indonesia/bali/kuta/kuta-beach.html',
    sourceUrl: 'https://www.skylinewebcams.com/en/webcam/indonesia/bali/kuta/kuta-beach.html',
    timezone: 'Asia/Makassar',
    isLive: true,
    quality: 'HD',
    description: 'Beautiful Kuta Beach in Bali',
  },

  // South America
  {
    id: 'rio-copacabana',
    name: 'Copacabana Beach',
    location: 'Rio de Janeiro, Brazil',
    coordinates: [-22.9711, -43.1822],
    region: 'south-america',
    category: 'beach',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/brasil/rio-de-janeiro/rio-de-janeiro/copacabana-beach.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/brasil/rio-de-janeiro/rio-de-janeiro/copacabana-beach.html',
    timezone: 'America/Sao_Paulo',
    isLive: true,
    quality: 'HD',
    description: 'Famous Copacabana Beach',
  },
  {
    id: 'buenos-aires-obelisco',
    name: 'Obelisco',
    location: 'Buenos Aires, Argentina',
    coordinates: [-34.6037, -58.3816],
    region: 'south-america',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/argentina/ciudad-autonoma-de-buenos-aires/buenos-aires/obelisco.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/argentina/ciudad-autonoma-de-buenos-aires/buenos-aires/obelisco.html',
    timezone: 'America/Argentina/Buenos_Aires',
    isLive: true,
    quality: 'HD',
    description: 'Historic Obelisco monument',
  },

  // Oceania
  {
    id: 'sydney-opera-house',
    name: 'Sydney Opera House',
    location: 'Sydney, Australia',
    coordinates: [-33.8568, 151.2153],
    region: 'oceania',
    category: 'landmark',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/australia/new-south-wales/sydney/opera-house.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/australia/new-south-wales/sydney/opera-house.html',
    timezone: 'Australia/Sydney',
    isLive: true,
    quality: '4K',
    description: 'Iconic Sydney Opera House',
  },
  {
    id: 'auckland-harbor',
    name: 'Auckland Harbor',
    location: 'Auckland, New Zealand',
    coordinates: [-36.8485, 174.7633],
    region: 'oceania',
    category: 'city',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/new-zealand/auckland/auckland/auckland-harbor.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/new-zealand/auckland/auckland/auckland-harbor.html',
    timezone: 'Pacific/Auckland',
    isLive: true,
    quality: 'HD',
    description: 'Beautiful Auckland Harbor',
  },

  // Africa
  {
    id: 'cape-town-table-mountain',
    name: 'Table Mountain',
    location: 'Cape Town, South Africa',
    coordinates: [-33.9575, 18.4095],
    region: 'africa',
    category: 'mountain',
    streamUrl:
      'https://www.skylinewebcams.com/en/webcam/south-africa/western-cape/cape-town/table-mountain.html',
    sourceUrl:
      'https://www.skylinewebcams.com/en/webcam/south-africa/western-cape/cape-town/table-mountain.html',
    timezone: 'Africa/Johannesburg',
    isLive: true,
    quality: 'HD',
    description: 'Majestic Table Mountain',
  },
  {
    id: 'cairo-pyramids',
    name: 'Great Pyramids',
    location: 'Cairo, Egypt',
    coordinates: [29.9792, 31.1342],
    region: 'africa',
    category: 'landmark',
    streamUrl: 'https://www.skylinewebcams.com/en/webcam/egypt/giza/giza/pyramids-of-giza.html',
    sourceUrl: 'https://www.skylinewebcams.com/en/webcam/egypt/giza/giza/pyramids-of-giza.html',
    timezone: 'Africa/Cairo',
    isLive: true,
    quality: 'HD',
    description: 'Ancient Pyramids of Giza',
  },

  // Antarctica
  {
    id: 'antarctica-mcmurdo',
    name: 'McMurdo Station',
    location: 'Ross Island, Antarctica',
    coordinates: [-77.8463, 166.6769],
    region: 'antarctica',
    category: 'nature',
    streamUrl: 'https://www.usap.gov/videoclipsandmaps/mcmwebcam.cfm',
    sourceUrl: 'https://www.usap.gov/videoclipsandmaps/mcmwebcam.cfm',
    timezone: 'Antarctica/McMurdo',
    isLive: true,
    quality: 'SD',
    description: 'Antarctic research station',
  },

  // Nature & Wildlife
  {
    id: 'yellowstone-old-faithful',
    name: 'Old Faithful Geyser',
    location: 'Yellowstone, USA',
    coordinates: [44.4605, -110.8281],
    region: 'north-america',
    category: 'nature',
    streamUrl: 'https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm',
    sourceUrl: 'https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm',
    timezone: 'America/Denver',
    isLive: true,
    quality: 'HD',
    description: 'Famous Old Faithful geyser eruptions',
  },
  {
    id: 'maui-pipeline',
    name: 'Banzai Pipeline',
    location: 'Maui, Hawaii',
    coordinates: [21.6648, -158.0534],
    region: 'north-america',
    category: 'beach',
    streamUrl: 'https://www.surfline.com/surf-report/pipeline/5842041f4e65fad6a7708890',
    sourceUrl: 'https://www.surfline.com/surf-report/pipeline/5842041f4e65fad6a7708890',
    timezone: 'Pacific/Honolulu',
    isLive: true,
    quality: 'HD',
    description: 'World-famous surf break',
  },
];

/**
 * Webcam Manager Class
 * Handles filtering, searching, and data operations
 */
class WebcamManager {
  constructor(data) {
    this.data = data;
    this.filtered = data;
  }

  /**
   * Filter webcams by region
   */
  filterByRegion(region) {
    if (region === 'all') {
      this.filtered = this.data;
    } else {
      this.filtered = this.data.filter(cam => cam.region === region);
    }
    return this.filtered;
  }

  /**
   * Filter webcams by category
   */
  filterByCategory(category) {
    if (category === 'all') {
      this.filtered = this.data;
    } else {
      this.filtered = this.data.filter(cam => cam.category === category);
    }
    return this.filtered;
  }

  /**
   * Search webcams by name or location
   */
  search(query) {
    if (!query) {
      this.filtered = this.data;
    } else {
      const lowerQuery = query.toLowerCase();
      this.filtered = this.data.filter(
        cam =>
          cam.name.toLowerCase().includes(lowerQuery) ||
          cam.location.toLowerCase().includes(lowerQuery) ||
          cam.description.toLowerCase().includes(lowerQuery)
      );
    }
    return this.filtered;
  }

  /**
   * Apply multiple filters
   */
  applyFilters(region, category, searchQuery) {
    let result = this.data;

    if (region !== 'all') {
      result = result.filter(cam => cam.region === region);
    }

    if (category !== 'all') {
      result = result.filter(cam => cam.category === category);
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(
        cam =>
          cam.name.toLowerCase().includes(lowerQuery) ||
          cam.location.toLowerCase().includes(lowerQuery) ||
          cam.description.toLowerCase().includes(lowerQuery)
      );
    }

    this.filtered = result;
    return this.filtered;
  }

  /**
   * Get statistics
   */
  getStats() {
    const liveCams = this.data.filter(cam => cam.isLive).length;
    const countries = new Set(this.data.map(cam => cam.location.split(',').pop().trim())).size;

    return {
      total: this.data.length,
      live: liveCams,
      countries: countries,
    };
  }

  /**
   * Get featured webcams (random selection)
   */
  getFeatured(count = 5) {
    const shuffled = [...this.data].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Get webcam by ID
   */
  getById(id) {
    return this.data.find(cam => cam.id === id);
  }

  /**
   * Get all webcams
   */
  getAll() {
    return this.data;
  }

  /**
   * Get filtered webcams
   */
  getFiltered() {
    return this.filtered;
  }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WEBCAM_DATA, WebcamManager };
}
