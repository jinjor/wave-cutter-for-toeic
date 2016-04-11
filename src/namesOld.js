function namingType0() {
  return {
    name: 'None',
    names: []
  };
}
function namingType1() {
  var names = [];
  for(var i = 1; i <= 40; i++) {
    names.push('' + i);
  }
  for(var i = 0; i < 20; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
  }
  return {
    name: 'All',
    names: names
  };
}
function namingType2() {
  var names = [];
  for(var i = 1; i <= 40; i++) {
    names.push('' + i);
  }
  for(var i = 0; i < 20; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
    names.push(40 + 3*i + 1);
    names.push(40 + 3*i + 2);
    names.push(40 + 3*i + 3);
  }
  return {
    name: 'All+',
    names: names
  };
}
function namingType3() {
  var names = [];
  for(var i = 1; i <= 10; i++) {
    names.push('' + i);
  }
  return {
    name: 'Part1',
    names: names
  };
}
function namingType4() {
  var names = [];
  for(var i = 11; i <= 40; i++) {
    names.push('' + i);
  }
  return {
    name: 'Part2',
    names: names
  };
}
function namingType5() {
  var names = [];
  for(var i = 0; i < 10; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
  }
  return {
    name: 'Part3',
    names: names
  };
}
function namingType6() {
  var names = [];
  for(var i = 0; i < 10; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
    names.push(40 + 3*i + 1);
    names.push(40 + 3*i + 2);
    names.push(40 + 3*i + 3);
  }
  return {
    name: 'Part3+',
    names: names
  };
}
function namingType7() {
  var names = [];
  for(var i = 10; i < 20; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
  }
  return {
    name: 'Part4',
    names: names
  };
}
function namingType8() {
  var names = [];
  for(var i = 10; i < 20; i++) {
    names.push((40 + 3*i + 1) + '-' + (40 + 3*i + 3));
    names.push(40 + 3*i + 1);
    names.push(40 + 3*i + 2);
    names.push(40 + 3*i + 3);
  }
  return {
    name: 'Part4+',
    names: names
  };
}

function namingType9() {
  return {
    name: 'From'
  };
}

module.exports = [namingType1(), namingType2(), namingType3(),
  namingType4(), namingType5(), namingType6(), namingType7(), namingType8(), namingType9()];
