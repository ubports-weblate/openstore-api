const Package = require('../db').Package;
const config = require('../utils/config');
const discoverJSON = require('./json/discover_apps.json');
const helpers = require('../utils/helpers');
const packages = require('../utils/packages');
const logger = require('../utils/logger');

const shuffle = require('shuffle-array');
const moment = require('moment');
const express = require('express');

const router = express.Router();

discoverJSON.highlight.image = config.server.host + discoverJSON.highlight.image;
let discoverCache = null;
let discoverDate = null;

router.get('/', (req, res) => {
    let now = moment();
    if (!discoverDate || now.diff(discoverDate, 'minutes') > 10 || !discoverCache) { // Cache miss
        let discover = JSON.parse(JSON.stringify(discoverJSON));
        let staticCategories = discover.categories.filter((category) => {
            return (category.ids.length > 0);
        });

        Promise.all([
            Package.findOne({id: discover.highlight.id}),

            Promise.all(staticCategories.map((category) => {
                return Package.find({id: {$in: category.ids}});
            })),

            Package.find({
                published: true,
                nsfw: {$in: [null, false]},
            }).limit(8).sort('-published_date'),

            Package.find({
                published: true,
                nsfw: {$in: [null, false]},
            }).limit(8).sort('-updated_date'),
        ]).then(([highlight, staticCategoriesApps, newApps, updatedApps]) => {
            discover.highlight.app = packages.toJson(highlight, req);

            staticCategories.forEach((category, index) => {
                category.ids = shuffle(category.ids);
                category.apps = shuffle(staticCategoriesApps[index]);
            });

            let newAndUpdatedCategory = discover.categories.filter((category) => {
                return (category.name == 'New and Updated Apps');
            })[0];

            // Get the first 10 unique app ids
            let ids = newApps.map((app) => {
                return app.id;
            }).concat(updatedApps.map((app) => {
                return app.id;
            }));
            ids = ids.filter((item, pos) => {
                // Only unique ids;
                return ids.indexOf(item) == pos;
            });
            newAndUpdatedCategory.ids = ids.slice(0, 10);

            let newAndUpdatedApps = newApps.concat(updatedApps);
            newAndUpdatedCategory.apps = newAndUpdatedCategory.ids.map((id) => {
                return newAndUpdatedApps.filter((app) => {
                    return (app.id == id);
                })[0];
            });
            newAndUpdatedCategory.apps = newAndUpdatedCategory.apps.map((app) => {
                return packages.toJson(app, req);
            });

            discoverCache = discover;
            discoverDate = now;

            helpers.success(res, discover);
        }).catch((err) => {
            logger.error(err);
            helpers.error(res, 'Unable to fetch discovery data at this time');
        });
    }
    else { // Cache hit
        helpers.success(res, discoverCache);
    }
});

module.exports = router;