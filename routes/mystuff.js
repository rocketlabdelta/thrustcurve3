/*
 * Copyright 2016 John Coker for ThrustCurve.org
 * Licensed under the ISC License, https://opensource.org/licenses/ISC
 */
'use strict';

const express = require('express'),
      router = express.Router(),
      passport = require('passport'),
      schema = require('../database/schema'),
      units = require('../lib/units'),
      locals = require('./locals.js'),
      authenticated = require('./authenticated.js');

const loginLink = '/mystuff/login.html',
      registerLink = '/mystuff/register.html',
      forgotLink = '/mystuff/forgotpasswd.html',
      favoritesLink = '/mystuff/favorites.html',
      rocketsLink = '/mystuff/rockets.html',
      preferencesLink = '/mystuff/preferences.html',
      profileLink = '/mystuff/profile.html';

const defaults = {
  layout: 'mystuff'
};

function getRedirect(req) {
  var referer, redirect;

  // get page to redirect to after login
  if (req.session.loginRedirect) {
    // use the defined redirect page
    redirect = req.session.loginRedirect;
    delete req.session.loginRedirect;
  } else if ((referer = req.header('Referer')) &&
	     (/^https?:\/\/(www\.)?thrustcurve\.org\//.test(referer) ||
	      /^http:\/\/localhost:\d+\//.test(referer)) &&
             !/(login|register)\.html/.test(referer)) {
    // use the referrer, since it's on the site
    redirect = referer;
  }

  return redirect;
}

/*
 * /mystuff/login.html
 * Passport login flow, probably redirected from another page requiring a user.
 * Renders with mystuff/login.hbs template.
 */
router.get(loginLink, function(req, res, next) {
  // render the login page
  res.render('mystuff/login', locals(defaults, {
    title: 'Log In',
    layout: 'info',
    submitLink: loginLink,
    registerLink: registerLink,
    forgotLink: forgotLink,
    redirect: getRedirect(req),
  }));
});
router.get('login.jsp', function(req, res, next) {
  res.redirect(301, loginLink);
});

router.post(loginLink, passport.authenticate('local', {
  failureRedirect: loginLink
}), function(req, res, next) {
  var redirect = req.body.redirect || req.query.redirect || profileLink;
  res.redirect(redirect);
});

/*
 * /mystuff/register.html
 * Renders with mystuff/register.hbs template.
 */
router.get(registerLink, function(req, res, next) {
  res.render('mystuff/register', locals(defaults, {
    title: 'Register',
    layout: 'info',
    info: { showEmail: true },
    submitLink: registerLink,
    loginLink: loginLink,
    forgotLink: forgotLink,
    redirect: getRedirect(req),
  }));
});
router.get(['/register.jsp'], function(req, res, next) {
  res.redirect(301, registerLink);
});

router.post(registerLink, function(req, res, next) {
  // collect parameters
  var info = {}, errors = [],
      v;

  v = req.body.name.trim();
  if (v == null || v === '') {
    errors.push('Please enter your name for public display.');
  } else {
    info.name = v;
  }

  v = req.body.email.trim();
  if (v == null || v === '' || !schema.EmailRegex.test(v)) {
    errors.push('Please enter your email address as your login name.');
  } else {
    info.email = v;
  }

  v = req.body.password;
  if (v == null || v === '') {
    errors.push('Please enter a password to protect your account.');
  } else {
    info.password = v;

    v = req.body.password2;
    if (v != info.password)
      errors.push('Please confirm your password by entering it twice.');
  }

  v = req.body.showEmail;
  if (v)
    info.showEmail = true;
  else
    info.showEmail = false;

  if (errors.length > 0) {
    res.render('mystuff/register', locals(defaults, {
      title: 'Register',
      layout: 'info',
      info: info,
      errors: errors,
      submitLink: registerLink,
      loginLink: loginLink,
      forgotLink: forgotLink,
    }));
    return;
  }

  // make sure the email isn't already in use
  req.db.Contributor.findOne({ email: info.email }, req.success(function(existing) {
    if (existing) {
      res.render('mystuff/forgotpasswd', {
        title: 'Forgot Password',
        layout: 'info',
        email: info.email,
        errors: ['Email address already registered.'],
        submitLink: forgotLink,
        loginLink: loginLink,
        registerLink: registerLink,
      });
      return;
    }

    // create the user and log them in
    info.lastLogin = new Date();
    var model = new req.db.Contributor(info);
    model.save(req.success(function(updated) {
      req.login(updated, function(err) {
        if (err)
          return next(err);

        var redirect = req.body.redirect || req.query.redirect || profileLink;
        res.redirect(redirect);
      });
    }));
  }));
});


/*
 * /mystuff/forgotpasswd.html
 * Renders with mystuff/forgotpasswd.hbs template.
 */
router.get('/mystuff/forgotpasswd.html', authenticated, function(req, res, next) {
  res.render('mystuff/forgotpasswd', locals(req, defaults, {
    title: 'Forgot Password',
    submitLink: forgotLink,
    loginLink: loginLink,
    registerLink: registerLink,
  }));
});


/*
 * /mystuff/favorites.html
 * Renders with mystuff/favorites.hbs template.
 */
router.get('/mystuff/favorites.html', authenticated, function(req, res, next) {
  req.db.FavoriteMotor.find({ _contributor: req.user._id }).exec(req.success(function(favorites) {
    req.db.MotorView.find({ _contributor: req.user._id }).sort({ updatedAt: -1 }).limit(100).exec(req.success(function(recents) {
      var ids = [], id, i;

      // colect IDs of favorite motors
      for (i = 0; i < favorites.length; i++)
        ids.push(favorites[i]._motor.toString());

      // filter out favorites and de-dup
      if (recents.length > 0) {
        for (i = 0; i < recents.length; ) {
          id = recents[i]._motor.toString();
          if (ids.indexOf(id) < 0) {
            // add to motor IDs
            ids.push(id);
            i++;
          } else {
            // remove from recents
            recents.splice(i, 1);
          }
        }
      }

      // fetch needed motors
      req.db.Motor.find({ '_id': { $in: ids } }).populate('_manufacturer', 'abbrev').exec(req.success(function(motors) {
        var map = {}, id, i;

        // hand-populate favorites and recents
        for (i = 0; i < motors.length; i++) {
          id = motors[i]._id.toString();
          map[id] = motors[i];
        }
        for (i = 0; i < favorites.length; i++) {
          id = favorites[i]._motor.toString();
          favorites[i]._motor = map[id];
        }
        for (i = 0; i < recents.length; i++) {
          id = recents[i]._motor.toString();
          recents[i]._motor = map[id];
        }

        res.render('mystuff/favorites', locals(req, defaults, {
          title: 'Favorite Motors',
          favorites: favorites,
          recents: recents,
        }));
      }));
    }));
  }));
});

function addFavorite(req, res, motor) {
  if (!req.db.isId(motor)) {
    // invalid motor ID
    res.status(404).send('Invalid motor ID');
  } else {
    req.db.FavoriteMotor.findOne({ _contributor: req.user._id, _motor: motor }, req.success(function(favorite) {
      if (favorite) {
        // already a favorite
        res.redirect(favoritesLink);
      } else {
        favorite = new req.db.FavoriteMotor({
          _contributor: req.user._id,
          _motor: motor
        });
        favorite.save(req.success(function(saved) {
          // now is a favorite
          res.redirect(favoritesLink);
        }));
      }
    }));
  }
}

router.get('/mystuff/addfavorite.html', authenticated, function(req, res, next) {
  addFavorite(req, res, req.query.motor);
});
router.post('/mystuff/addfavorite.html', authenticated, function(req, res, next) {
  addFavorite(req, res, req.body.motor);
});

function removeFavorite(req, res, motor) {
  if (!req.db.isId(motor)) {
    // invalid motor ID
    res.redirect(favoritesLink);
  } else {
    req.db.FavoriteMotor.remove({ _contributor: req.user._id, _motor: motor }, req.success(function() {
      res.redirect(favoritesLink);
    }));
  }
}

router.get('/mystuff/removefavorite.html', authenticated, function(req, res, next) {
  removeFavorite(req, res, req.query.motor);
});
router.post('/mystuff/removefavorite.html', authenticated, function(req, res, next) {
  removeFavorite(req, res, req.body.motor);
});


/*
 * /mystuff/rockets.html
 * Renders with mystuff/rockets.hbs template.
 */
router.get(rocketsLink, authenticated, function(req, res, next) {
  req.db.Rocket.find({ _contributor: req.user._id }, req.success(function(rockets) {
    res.render('mystuff/rockets', locals(req, defaults, {
      title: 'My Rockets',
      rockets: rockets,
      isDeleted: req.query.result == 'deleted'
    }));
  }));
});


/*
 * /mystuff/rocket/id/
 * Renders with mystuff/rocketdetails.hbs template.
 */
router.get('/mystuff/rocket/:id/', authenticated, function(req, res, next) {
  var id = req.params.id;
  if (req.db.isId(id)) {
    req.db.Rocket.findOne({ _contributor: req.user._id, _id: id }, req.success(function(rocket) {
      var mmtDiameter, mmtLength, tolerance = 0.0015, query, i;

      if (rocket == null) {
	res.redirect(303, rocketsLink);
	return;
      }

      mmtDiameter = units.convertUnitToMKS(rocket.mmtDiameter, 'length', rocket.mmtDiameterUnit);
      mmtLength = units.convertUnitToMKS(rocket.mmtLength, 'length', rocket.mmtLengthUnit);
      query = {
        diameter: { $gt: mmtDiameter - tolerance, $lt: mmtDiameter + tolerance },
        length: { $lt: mmtLength + tolerance },
        availability: { $in: schema.MotorAvailableEnum }
      };
      if (rocket.adapters && rocket.adapters.length > 0) {
        query.$or = [ {
          diameter: query.diameter,
          length: query.length
        } ];
        delete query.diameter;
        delete query.length;
        for (i = 0; i < rocket.adapters.length; i++) {
          mmtDiameter = units.convertUnitToMKS(rocket.adapters[i].mmtDiameter, 'length', rocket.adapters[i].mmtDiameterUnit);
          mmtLength = units.convertUnitToMKS(rocket.adapters[i].mmtLength, 'length', rocket.adapters[i].mmtLengthUnit);
          query.$or.push({
            diameter: { $gt: mmtDiameter - tolerance, $lt: mmtDiameter + tolerance },
            length: { $lt: mmtLength + tolerance },
          });
        }
      }
      req.db.Motor.find(query)
        .sort({ totalImpulse: 1 })
        .select('totalImpulse impulseClass type _manufacturer')
        .exec(req.success(function(motors) {
          var classes = [], types = [], mfrIds = [],
              classRange, v, i;

          if (motors.length > 0) {
            for (i = 0; i < motors.length; i++) {
              v = motors[i].impulseClass;
              if (classes.indexOf(v) < 0)
                classes.push(v);

              v = motors[i].type;
              if (types.indexOf(v) < 0)
                types.push(v);

              v = motors[i]._manufacturer.toString();
              if (mfrIds.indexOf(v) < 0)
                mfrIds.push(v);
            }

            classes.sort();
            if (classes.length > 2)
              classRange = classes[0] + '−' + classes[classes.length - 1];
            else if (classes.length > 1)
              classRange = classes[0] + '&' + classes[1];
            else if (classes.length > 0)
              classRange = classes[0];
            else
              classRange = '—';

            types.sort(function(a,b) {
              return schema.MotorTypeEnum.indexOf(a) - schema.MotorTypeEnum.indexOf(b);
            });

            req.db.Manufacturer.find({ _id: { $in: mfrIds } })
              .sort({ abbrev: 1 })
              .select('abbrev')
              .exec(req.success(function(manufacturers) {
              res.render('mystuff/rocketdetails', locals(req, defaults, {
                title: rocket.name,
                rocket: rocket,
                mmtDiameter: mmtDiameter,
                mmtLength: mmtLength,

                motors: motors,
                motorCount: motors.length,
                singleMotor: motors.length == 1 ? motors[0] : undefined,

                classes: classes,
                classCount: classes.length,
                classRange: classRange,

                types: types,
                typeCount: types.length,
                singleType: types.length == 1 ? types[0] : undefined,

                manufacturers: manufacturers,
                manufacturerCount: manufacturers.length,
                singleManufacturer: manufacturers.length == 1 ? manufacturers[0] : undefined,

                result: req.query.result,
                isCreated: req.query.result == 'created',
                isSaved: req.query.result == 'saved',
                isUnchanged: req.query.result == 'unchanged',
                editLink: '/mystuff/rocket/' + id + '/edit.html',
                deleteLink: '/mystuff/rocket/' + id + '/delete.html',
              }));
            }));
          } else {
            res.render('mystuff/rocketdetails', locals(req, defaults, {
              title: rocket.name,
              rocket: rocket,

              motorCount: 0,
              classCount: 0,
              classRange: '—',
              manufacturerCount: 0,

              result: req.query.result,
              isCreated: req.query.result == 'created',
              isSaved: req.query.result == 'saved',
              isUnchanged: req.query.result == 'unchanged',
              editLink: '/mystuff/rocket/' + id + '/edit.html',
              deleteLink: '/mystuff/rocket/' + id + '/delete.html',
            }));
          }
      }));
    }));
  } else {
    res.redirect(303, rocketsLink);
  }
});

/*
 * /mystuff/rocket/id/edit.html
 * Renders with mystuff/editrocket.hbs template.
 */
const finishes = [
  { label: 'perfect', value: 0.3 },
  { label: 'good', value: 0.5 },
  { label: 'average', value: 0.75 },
  { label: 'high', value: 1.0, last: true },
];
Object.freeze(finishes);

router.get('/mystuff/rocket/:id/edit.html', authenticated, function(req, res, next) {
  var id = req.params.id;

  if (req.db.isId(id)) {
    req.db.Rocket.findOne({ _contributor: req.user._id, _id: id }, req.success(function(rocket) {
      if (rocket == null) {
	res.redirect(303, rocketsLink);
	return;
      }
      res.render('mystuff/editrocket', locals(req, defaults, {
	title: 'Edit Rocket',
	isNew: false,
	rocket: rocket,
	lengthUnits: units.length,
	massUnits: units.mass,
	finishes: finishes,
	submitLink: '/mystuff/rocket/' + id + '/edit.html',
        adapterLink: '/mystuff/rocket/' + id + '/adapter.html',
	cancelLink: '/mystuff/rocket/' + id + '/',
      }));
    }));
  } else {
    // add new rocket
    var lengthUnit = units.getUnitPref('length').label,
	massUnit = units.getUnitPref('mass').label,
	guideUnit, guideLen;

    // default guide length based on chosen units
    if (lengthUnit == 'in' || lengthUnit == 'ft') {
      guideUnit = 'ft';
      guideLen = 3.0;
    } else {
      guideUnit = 'm';
      guideLen = 1.0;
    }

    res.render('mystuff/editrocket', locals(req, defaults, {
      title: 'Add Rocket',
      isNew: true,
      rocket: {
	'public': true,
	bodyDiameterUnit: lengthUnit,
        weightUnit: massUnit,
        mmtDiameterUnit: 'mm',
	mmtLengthUnit: lengthUnit,
	mmtCount: 1,
	cd: 0.75,
        guideLength: guideLen,
        guideLengthUnit: guideUnit,
      },
      lengthUnits: units.length,
      massUnits: units.mass,
      finishes: finishes,
      submitLink: '/mystuff/rocket/new/edit.html',
      cancelLink: '/mystuff/rockets.html',
    }));
  }
});
router.get('/updaterocket.jsp', function(req, res, next) {
  var id = req.query.id;
  if (id && /^[1-9][0-9]*$/.test(id)) {
    // old-style MySQL row ID; go to rocket edit
    req.db.Rocket.findOne({ migratedId: parseInt(id) }, req.success(function(found) {
      if (found)
        res.redirect(301, '/mystuff/rocket/' + found._id + '/edit.html');
      else
        res.redirect(303, rocketsLink);
    }));
  } else {
    res.redirect(301, rocketsLink);
  }
});

function doSubmitRocket(req, res, rocket) {
  var isNew = false, isChanged = false,
      errors = [], url, v;

  if (rocket == null) {
    rocket = {
      _contributor: req.user._id
    };
    isNew = true;
  }

  // non-numeric values
  [ 'name',
    'website',
    'comments',
  ].forEach(function(p) {
    var s;
    if (req.body.hasOwnProperty(p)) {
      s = req.body[p].trim();
      if (s === '') {
        if (rocket[p] != null) {
          rocket[p] = undefined;
          isChanged = true;
        }
      } else {
        if (rocket[p] == null || req.body[p] != rocket[p].toString()) {
          rocket[p] = req.body[p];
          isChanged = true;
        }
      }
    }
  });
  if (rocket.name == null || rocket.name === '') {
    errors.push('Rocket name is required.');
  }

  // public flag
  v = req.body.public == 'on' || req.body.public == 'true';
  if (rocket.public != v) {
    rocket.public = v;
    isChanged = true;
  }

  // dimensions with units
  [ 'bodyDiameter',
    'weight',
    'mmtDiameter',
    'mmtLength',
    'guideLength',
  ].forEach(function(valueProp) {
    var unitProp = valueProp + 'Unit',
	u, v;

    if (req.body.hasOwnProperty(valueProp)) {
      v = parseFloat(req.body[valueProp]);
      u = req.body[unitProp];

      if (valueProp == 'weight')
	u = units.mass.get(u);
      else
	u = units.length.get(u);

      if (isNaN(v) || v <= 0 || u == null)
	errors.push('Rocket ' + valueProp + ' (with unit) is required.');
      else if (rocket[valueProp] != v || rocket[unitProp] != u.label) {
	rocket[valueProp] = v;
	rocket[unitProp] = u.label;
	isChanged = true;
      }
    }
  });

  // simple numeric values
  [ 'mmtCount',
    'cd',
  ].forEach(function(p) {
    var v;
    if (req.body.hasOwnProperty(p)) {
      v = parseFloat(req.body[p]);
      if (isNaN(v) || v <= 0)
	errors.push('Rocket ' + p + ' is required.');
      else if (rocket[p] != v) {
	rocket[p] = v;
	isChanged = true;
      }
    }
  });

  if (isNew)
    url = '/mystuff/rocket/new/edit.html';
  else
    url = '/mystuff/rocket/' + rocket._id + '/edit.html';

  if (errors.length > 0) {
    res.render('mystuff/editrocket', locals(req, defaults, {
      title: isNew ? 'Add Rocket' : 'Edit Rocket',
      isNew: isNew,
      rocket: rocket,
      lengthUnits: units.length,
      massUnits: units.mass,
      finishes: finishes,
      errors: errors,
      submitLink: url
    }));
  } else if (isNew) {
    req.db.Rocket.create(new req.db.Rocket(rocket), req.success(function(updated) {
      url = '/mystuff/rocket/' + updated._id + '/';
      res.redirect(303, url + '?result=created');
    }));
  } else {
    url = '/mystuff/rocket/' + rocket._id + '/';
    if (isChanged) {
      rocket.save(req.success(function(updated) {
	res.redirect(303, url + '?result=saved');
      }));
    } else {
      res.redirect(303, url + '?result=unchanged');
    }
  }
}

router.post('/mystuff/rocket/:id/edit.html', authenticated, function(req, res, next) {
  var id = req.params.id;

  if (req.db.isId(id)) {
    req.db.Rocket.findOne({ _contributor: req.user._id, _id: id }, req.success(function(rocket) {
      if (rocket == null)
	res.redirect(303, rocketsLink);
      else
	doSubmitRocket(req, res, rocket);
    }));
  } else {
    doSubmitRocket(req, res);
  }
});

/*
 * /mystuff/rocket/id/adapter.html
 * Redirects to rocket edit page.
 */
router.post('/mystuff/rocket/:id/adapter.html', authenticated, function(req, res, next) {
  var id = req.params.id;

  if (req.db.isId(id)) {
    req.db.Rocket.findOne({ _contributor: req.user._id, _id: id }, req.success(function(rocket) {
      var index, adapter, isNew, isChanged = false, errors = [];

      if (rocket == null) {
	res.redirect(303, rocketsLink);
        return;
      }

      // get the existing adapter
      if (req.body.index) {
        index = parseInt(req.body.index);
        if (isNaN(index) || index < 0)
          index = -1;
        else
          adapter = rocket.adapters[index];
      }
      if (adapter == null) {
        adapter = {};
        isNew = true;
      }

      // dimensions with units
      [
        'mmtDiameter',
        'mmtLength',
        'weight',
      ].forEach(function(valueProp) {
        var unitProp = valueProp + 'Unit',
            u, v;

        if (req.body.hasOwnProperty(valueProp)) {
          v = parseFloat(req.body[valueProp]);
          u = req.body[unitProp];

          if (valueProp == 'weight')
            u = units.mass.get(u);
          else
            u = units.length.get(u);

          if (isNaN(v) || v <= 0 || u == null)
            errors.push('Adapter ' + valueProp + ' (with unit) is required.');
          else if (adapter[valueProp] != v || adapter[unitProp] != u.label) {
            adapter[valueProp] = v;
            adapter[unitProp] = u.label;
            isChanged = true;
          }
        }
      });

      if (req.body.hasOwnProperty('remove')) {
        // remove an adapter
        if (index >= 0 && index < rocket.adapters.length) {
          rocket.adapters.splice(index, 1);
          isChanged = true;
        }
      } else {
        // add/update an adapter
        if (isNew && isChanged)
          rocket.adapters.push(adapter);
      }

      if (!isChanged) {
        res.redirect('/mystuff/rocket/' + rocket._id + '/edit.html?result=unchanged');
        return;
      }

      rocket.save(req.success(function(updated) {
        res.redirect('/mystuff/rocket/' + updated._id + '/edit.html?result=updated');
      }));
    }));
  } else {
    res.redirect(303, rocketsLink);
  }
});

/*
 * /mystuff/rocket/id/delete.html
 * Redirects to rocket list.
 */
router.get('/mystuff/rocket/:id/delete.html', authenticated, function(req, res, next) {
  var id = req.params.id;
  if (req.db.isId(id)) {
    req.db.Rocket.remove({ _contributor: req.user._id, _id: id }, req.success(function(rocket) {
      res.redirect(303, rocketsLink + '?result=deleted');
    }));
  } else {
    res.redirect(303, rocketsLink);
  }
});


/*
 * /mystuff/prefs.html
 * Renders with mystuff/prefs.hbs template.
 */
router.get([preferencesLink, '/mystuff/prefs.html'], authenticated, function(req, res, next) {
  // normalize preferences
  var prefs = {},
      unitSet;

  // first get the default units
  if (req.user.preferences.defaultUnits)
    unitSet = units.defaults.get(req.user.preferences.defaultUnits);
  if (unitSet == null)
    unitSet = units.defaults[0];
  prefs.defaultUnits = unitSet.label;

  // resolve each specific unit preference
  [ 'length',
    'mass',
    'force',
    'velocity',
    'acceleration',
    'altitude'
  ].forEach(function(unit) {
    var prefName = unit + 'Unit',
        prefValue = req.user.preferences[prefName],
        value;

    if (prefValue)
      value = units[unit].get(prefValue);
    if (value == null)
      value = units[unit].get(unitSet[unit]);
    prefs[prefName] = value.label;
  });

  res.render('mystuff/preferences', locals(req, defaults, {
    title: 'Preferences',
    units: units,
    defaults: units.defaults,
    prefs: prefs,
    submitLink: preferencesLink,
  }));
});

router.post([preferencesLink], authenticated, function(req, res, next) {
  var change = false;

  [ 'defaultUnits',
    'lengthUnit',
    'massUnit',
    'forceUnit',
    'velocityUnit',
    'accelerationUnit',
    'altitudeUnit'
  ].forEach(function(pref) {
    var value = req.body[pref];
    if (value != null && value !== '' && value != req.user.preferences[pref]) {
      req.user.preferences[pref] = value;
      change = true;
    }
  });

  if (change) {
    req.user.save(req.success(function(updated) {
      res.redirect(preferencesLink + '?result=saved');
    }));
  } else {
    res.redirect(preferencesLink + '?result=unchanged');
  }
});


/*
 * /mystuff/profile.html
 * Renders with mystuff/profile.hbs template.
 */
router.get(profileLink, authenticated, function(req, res, next) {
  res.render('mystuff/profile', locals(req, defaults, {
    title: 'My Profile',
    info: req.user,
    submitLink: profileLink,
  }));
});
router.get(['/updatecontrib.jsp'], function(req, res, next) {
  res.redirect(301, profileLink);
});

router.post(profileLink, authenticated, function(req, res, next) {
  // collect parameters
  var info = req.user, errors = [],
      change = false, changeEmail = false,
      v;

  if (req.body.hasOwnProperty('name')) {
    v = req.body.name.trim();
    if (v === '') {
      errors.push('Please enter your name for public display.');
    } else {
      if (v != info.name) {
        info.name = v;
        change = true;
      }
    }
  }

  if (req.body.hasOwnProperty('email')) {
    v = req.body.email.trim();
    if (v === '' || !schema.EmailRegex.test(v)) {
      errors.push('Please enter your email address as your login name.');
    } else {
      if (v != info.email) {
        info.email = v;
        change = changeEmail = true;
      }
    }

    v = req.body.showEmail == 'true' || req.body.showEmail == 'on';
    if (v != info.showEmail) {
      info.showEmail = v;
      change = true;
    }
  }

  if (req.body.hasOwnProperty('organization')) {
    v = req.body.organization.trim();
    if (v == null || v === '' || v == '-') {
      if (info.organization != null) {
        info.organization = undefined;
        change = true;
      }
    } else if (v != info.organization) {
      info.organization = v;
      change = true;
    }
  }

  if (req.body.hasOwnProperty('website')) {
    v = req.body.website.trim();
    if (v == null || v === '' || v == '-') {
      if (info.website != null) {
        info.website = undefined;
        change = true;
      }
    } else if (!schema.UrlRegex.test(v)) {
      errors.push('Please enter a valid URL for your web site.');
    } else {
      if (v != info.website) {
        info.website = v;
        change = true;
      }
    }
  }

  if (req.body.hasOwnProperty('password')) {
    v = req.body.password;
    if (v == null || v === '') {
      errors.push('A password is required to protect your account.');
    } else {
      info.password = v;
      change = true;

      v = req.body.password2;
      if (v != info.password)
        errors.push('Please confirm your password by entering it twice.');
    }
  }

  // if no changes, don't do anything
  if (!change && errors.length < 1) {
    res.render('mystuff/profile', locals(req, defaults, {
      title: 'My Profile',
      info: info,
      errors: errors,
      result: 'unchanged',
      submitLink: profileLink,
    }));
    return;
  }

  // error handling and update
  var submit = function() {
    if (errors.length > 0) {
      res.render('mystuff/profile', locals(req, defaults, {
        title: 'My Profile',
        info: info,
        errors: errors,
        submitLink: profileLink,
      }));
    } else {
      info.save(req.success(function(updated) {
        res.render('mystuff/profile', locals(req, defaults, {
          title: 'My Profile',
          info: updated,
          errors: errors,
          result: 'saved',
          submitLink: profileLink,
        }));
      }));
    }
  };

  // make sure the email isn't already in use
  if (changeEmail && errors.length < 1) {
    req.db.Contributor.findOne({ email: info.email }, req.success(function(existing) {
      if (existing && existing._id.toString() != info._id.toString())
        errors.push('That new email address is already registered.');
      submit();
    }));
  } else {
    submit();
  }
});

/*
 * /mystuff/logout.html
 * Log the current user out, redirects to index.
 */
router.get('/mystuff/logout.html', function(req, res, next) {
  req.logout();
  res.redirect('/');
});


module.exports = router;
