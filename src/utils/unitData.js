export const unitData = {
  Length: {
    units: ["Meter","Kilometer","Centimeter","Millimeter","Mile","Yard","Foot","Inch","Light-year","Nautical Mile","Angstrom","Parsec"],
    toBase: { Meter:v=>v, Kilometer:v=>v*1000, Centimeter:v=>v/100, Millimeter:v=>v/1000, Mile:v=>v*1609.344, Yard:v=>v*0.9144, Foot:v=>v*0.3048, Inch:v=>v*0.0254, "Light-year":v=>v*9.461e15, "Nautical Mile":v=>v*1852, Angstrom:v=>v*1e-10, Parsec:v=>v*3.086e16 },
    fromBase: { Meter:v=>v, Kilometer:v=>v/1000, Centimeter:v=>v*100, Millimeter:v=>v*1000, Mile:v=>v/1609.344, Yard:v=>v/0.9144, Foot:v=>v/0.3048, Inch:v=>v/0.0254, "Light-year":v=>v/9.461e15, "Nautical Mile":v=>v/1852, Angstrom:v=>v/1e-10, Parsec:v=>v/3.086e16 }
  },
  Mass: {
    units:["Kilogram","Gram","Milligram","Pound","Ounce","Ton","Stone","Carat"],
    toBase:{Kilogram:v=>v,Gram:v=>v/1000,Milligram:v=>v/1e6,Pound:v=>v*0.453592,Ounce:v=>v*0.0283495,Ton:v=>v*1000,Stone:v=>v*6.35029,Carat:v=>v*0.0002},
    fromBase:{Kilogram:v=>v,Gram:v=>v*1000,Milligram:v=>v*1e6,Pound:v=>v/0.453592,Ounce:v=>v/0.0283495,Ton:v=>v/1000,Stone:v=>v/6.35029,Carat:v=>v/0.0002}
  },
  Temperature: {
    units:["Celsius","Fahrenheit","Kelvin","Rankine"],
    toBase:{Celsius:v=>v,Fahrenheit:v=>(v-32)*(5/9),Kelvin:v=>v-273.15,Rankine:v=>(v-491.67)*(5/9)},
    fromBase:{Celsius:v=>v,Fahrenheit:v=>v*9/5+32,Kelvin:v=>v+273.15,Rankine:v=>(v+273.15)*9/5}
  },
  Volume: {
    units:["Liter","Milliliter","Cubic Meter","Gallon","Pint","Cup","Fluid Ounce","Barrel"],
    toBase:{Liter:v=>v,Milliliter:v=>v/1000,"Cubic Meter":v=>v*1000,Gallon:v=>v*3.78541,Pint:v=>v*0.473176,Cup:v=>v*0.236588,"Fluid Ounce":v=>v*0.0295735,Barrel:v=>v*158.987},
    fromBase:{Liter:v=>v,Milliliter:v=>v*1000,"Cubic Meter":v=>v/1000,Gallon:v=>v/3.78541,Pint:v=>v/0.473176,Cup:v=>v/0.236588,"Fluid Ounce":v=>v/0.0295735,Barrel:v=>v/158.987}
  },
  Time: {
    units:["Second","Minute","Hour","Day","Week","Year","Millisecond","Microsecond"],
    toBase:{Second:v=>v,Minute:v=>v*60,Hour:v=>v*3600,Day:v=>v*86400,Week:v=>v*604800,Year:v=>v*31557600,Millisecond:v=>v/1000,Microsecond:v=>v/1e6},
    fromBase:{Second:v=>v,Minute:v=>v/60,Hour:v=>v/3600,Day:v=>v/86400,Week:v=>v/604800,Year:v=>v/31557600,Millisecond:v=>v*1000,Microsecond:v=>v*1e6}
  },
  Force: {
    units:["Newton","Dyne","Pound-force","Kilopond","Kilogram-force"],
    toBase:{Newton:v=>v,Dyne:v=>v/1e5,"Pound-force":v=>v*4.44822,Kilopond:v=>v*9.80665,"Kilogram-force":v=>v*9.80665},
    fromBase:{Newton:v=>v,Dyne:v=>v*1e5,"Pound-force":v=>v/4.44822,Kilopond:v=>v/9.80665,"Kilogram-force":v=>v/9.80665}
  },
  Energy: {
    units:["Joule","Calorie","Kilowatt-hour","BTU","Electronvolt","Erg","Foot-pound"],
    toBase:{Joule:v=>v,Calorie:v=>v*4.184,"Kilowatt-hour":v=>v*3.6e6,BTU:v=>v*1055.06,Electronvolt:v=>v*1.602e-19,Erg:v=>v/1e7,"Foot-pound":v=>v*1.35582},
    fromBase:{Joule:v=>v,Calorie:v=>v/4.184,"Kilowatt-hour":v=>v/3.6e6,BTU:v=>v/1055.06,Electronvolt:v=>v/1.602e-19,Erg:v=>v*1e7,"Foot-pound":v=>v/1.35582}
  },
  Power: {
    units:["Watt","Horsepower","BTU/hr","Erg/sec","Kilowatt","Megawatt"],
    toBase:{Watt:v=>v,Horsepower:v=>v*745.7,"BTU/hr":v=>v*0.293071,"Erg/sec":v=>v/1e7,Kilowatt:v=>v*1000,Megawatt:v=>v*1e6},
    fromBase:{Watt:v=>v,Horsepower:v=>v/745.7,"BTU/hr":v=>v/0.293071,"Erg/sec":v=>v*1e7,Kilowatt:v=>v/1000,Megawatt:v=>v/1e6}
  },
  Pressure: {
    units:["Pascal","Bar","Atmosphere","Torr","PSI","mmHg"],
    toBase:{Pascal:v=>v,Bar:v=>v*1e5,Atmosphere:v=>v*101325,Torr:v=>v*133.322,PSI:v=>v*6894.76,mmHg:v=>v*133.322},
    fromBase:{Pascal:v=>v,Bar:v=>v/1e5,Atmosphere:v=>v/101325,Torr:v=>v/133.322,PSI:v=>v/6894.76,mmHg:v=>v/133.322}
  },
  Area: {
    units: ["Square Meter","Square Kilometer","Square Centimeter","Acre","Hectare","Square Mile","Square Foot","Square Inch","Square Yard","Gaj","Gajam","Guz","Square Guz","Bigha","Biswa","Katha","Kattha","Guntha","Gunta","Ground","Cent","Kanal","Marla"],
    toBase: {
      "Square Meter":v=>v, "Square Kilometer":v=>v*1e6, "Square Centimeter":v=>v/1e4, Acre:v=>v*4046.8564224, Hectare:v=>v*1e4, "Square Mile":v=>v*2.589988110336e6, "Square Foot":v=>v*0.09290304, "Square Inch":v=>v*0.00064516,
      "Square Yard":v=>v*0.83612736, Gaj:v=>v*0.83612736, Gajam:v=>v*0.83612736, Guz:v=>v*0.83612736, "Square Guz":v=>v*0.83612736,
      Bigha:v=>v*2500, Biswa:v=>v*125, Katha:v=>v*126.441, Kattha:v=>v*126.441, Guntha:v=>v*101.17141056, Gunta:v=>v*101.17141056, Ground:v=>v*222.967296, Cent:v=>v*40.468564224, Kanal:v=>v*505.857, Marla:v=>v*25.29285264
    },
    fromBase: {
      "Square Meter":v=>v, "Square Kilometer":v=>v/1e6, "Square Centimeter":v=>v*1e4, Acre:v=>v/4046.8564224, Hectare:v=>v/1e4, "Square Mile":v=>v/2.589988110336e6, "Square Foot":v=>v/0.09290304, "Square Inch":v=>v/0.00064516,
      "Square Yard":v=>v/0.83612736, Gaj:v=>v/0.83612736, Gajam:v=>v/0.83612736, Guz:v=>v/0.83612736, "Square Guz":v=>v/0.83612736,
      Bigha:v=>v/2500, Biswa:v=>v/125, Katha:v=>v/126.441, Kattha:v=>v/126.441, Guntha:v=>v/101.17141056, Gunta:v=>v/101.17141056, Ground:v=>v/222.967296, Cent:v=>v/40.468564224, Kanal:v=>v/505.857, Marla:v=>v/25.29285264
    }
  },
  Angle: {
    units:["Degree","Radian","Gradian","Turn"],
    toBase:{Degree:v=>v,Radian:v=>v*180/Math.PI,Gradian:v=>v*0.9,Turn:v=>v*360},
    fromBase:{Degree:v=>v,Radian:v=>v*Math.PI/180,Gradian:v=>v/0.9,Turn:v=>v/360}
  },
  Velocity: {
    units:["m/s","km/h","mph","knot","ft/s"],
    toBase:{"m/s":v=>v,"km/h":v=>v/3.6,mph:v=>v*0.44704,knot:v=>v*0.514444,"ft/s":v=>v*0.3048},
    fromBase:{"m/s":v=>v,"km/h":v=>v*3.6,mph:v=>v/0.44704,knot:v=>v/0.514444,"ft/s":v=>v/0.3048}
  },
  Frequency: {
    units:["Hertz","Kilohertz","Megahertz","Gigahertz","RPM"],
    toBase:{Hertz:v=>v,Kilohertz:v=>v*1000,Megahertz:v=>v*1e6,Gigahertz:v=>v*1e9,RPM:v=>v/60},
    fromBase:{Hertz:v=>v,Kilohertz:v=>v/1000,Megahertz:v=>v/1e6,Gigahertz:v=>v/1e9,RPM:v=>v*60}
  },
  "Data Storage": {
    units:["Bit","Byte","Kilobyte","Megabyte","Gigabyte","Terabyte","Petabyte"],
    // Exact binary (1024-based) values — the previous rounded constants
    // (e.g. 8.389e6 for Megabyte instead of the exact 8388608) introduced up
    // to ~0.005% systematic error, which defeats the point of the precision
    // slider going up to 8 decimal places.
    toBase:{Bit:v=>v,Byte:v=>v*8,Kilobyte:v=>v*8192,Megabyte:v=>v*8388608,Gigabyte:v=>v*8589934592,Terabyte:v=>v*8796093022208,Petabyte:v=>v*9007199254740992},
    fromBase:{Bit:v=>v,Byte:v=>v/8,Kilobyte:v=>v/8192,Megabyte:v=>v/8388608,Gigabyte:v=>v/8589934592,Terabyte:v=>v/8796093022208,Petabyte:v=>v/9007199254740992}
  },
  "Poetic Units": {
    units:["Heartbreak","Joy","Memory","Dream","Hope"],
    toBase:{Heartbreak:v=>v*3.2,Joy:v=>v*0.8,Memory:v=>v*1.5,Dream:v=>v*0.3,Hope:v=>v*2.1},
    fromBase:{Heartbreak:v=>v/3.2,Joy:v=>v/0.8,Memory:v=>v/1.5,Dream:v=>v/0.3,Hope:v=>v/2.1}
  }
}

export const regionalApprox = {
  Bigha: "Bigha varies by region — shown using the UP/Haryana definition (2500 m²).",
  Katha: "Katha varies by region — shown using the Bihar/Jharkhand definition (126.441 m²).",
  Kattha: "Kattha varies by region — shown using the Bihar/Jharkhand definition (126.441 m²)."
}

export const tempFloor = { Celsius:-273.15, Fahrenheit:-459.67, Kelvin:0, Rankine:0 }

export const presetMap = {
  "cm->in": { category: "Length", from: "Centimeter", to: "Inch" },
  "m->ft": { category: "Length", from: "Meter", to: "Foot" },
  "kg->lb": { category: "Mass", from: "Kilogram", to: "Pound" },
  "c->f": { category: "Temperature", from: "Celsius", to: "Fahrenheit" },
}