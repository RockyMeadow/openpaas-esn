(function() {
  'use strict';

  angular.module('esn.calendar')
         .constant('CALENDAR_ACCEPT_HEADER', 'application/calendar+json')
         .constant('CALENDAR_DAV_DATE_FORMAT', 'YYYYMMDD[T]HHmmss')
         .factory('calendarAPI', calendarAPI);

  var JSON_CONTENT_TYPE_HEADER = { 'Content-Type': 'application/json' };

  function calendarAPI(
    calendarRestangular,
    calPathBuilder,
    request,
    responseHandler,
    gracePeriodResponseHandler,
    _,
    CALENDAR_ACCEPT_HEADER,
    CALENDAR_DAV_DATE_FORMAT,
    CALENDAR_PREFER_HEADER,
    CALENDAR_CONTENT_TYPE_HEADER,
    CALENDAR_GRACE_DELAY
  ) {

    return {
      create: create,
      modify: modify,
      remove: remove,
      listEvents: listEvents,
      searchEvents: searchEvents,
      getEventByUID: getEventByUID,
      listCalendars: listCalendars,
      getCalendar: getCalendar,
      listEventsForCalendar: listEventsForCalendar,
      listAllCalendars: listAllCalendars,
      createCalendar: createCalendar,
      removeCalendar: removeCalendar,
      getRight: getRight,
      modifyCalendar: modifyCalendar,
      modifyShares: modifyShares,
      changeParticipation: changeParticipation,
      modifyPublicRights: modifyPublicRights
    };

    ////////////

    function davResponseHandler(key) {
      return responseHandler([200], function(response) {
        return (response.data && response.data._embedded && response.data._embedded[key]) || [];
      });
    }

    /**
     * Query one or more calendars for events in a specific range. The dav:calendar resources will include their dav:item resources.
     * @param  {String}   calendarHref The href of the calendar.
     * @param  {calMoment} start        calMoment type of Date, specifying the start of the range.
     * @param  {calMoment} end          calMoment type of Date, specifying the end of the range.
     * @return {Object}                An array of dav:items items.
     */
    function listEvents(calendarHref, start, end) {
      var body = {
        match: {
          start: start.format(CALENDAR_DAV_DATE_FORMAT),
          end: end.format(CALENDAR_DAV_DATE_FORMAT)
        }
      };

      return request('report', calendarHref, JSON_CONTENT_TYPE_HEADER, body).then(davResponseHandler('dav:item'));
    }

    /**
     * Query a calendar, searching for indexed events depending on the query. The dav:calendar resources will include their dav:item resources.
     * @method searchEvents
     * @param  {[type]} calendarId     The calendar id.
     * @param  {[type]} options        The query parameters {query: '', limit: 20, offset: 0}
     * @return {Object}                An array of dav:item items.
     */
    function searchEvents(calendarId, options) {
      var query = {
        query: options.query,
        limit: options.limit,
        offset: options.offset,
        sortKey: options.sortKey,
        sortOrder: options.sortOrder
      };

      return calendarRestangular.one(calendarId).one('events.json').get(query).then(davResponseHandler('dav:item'));
    }

    /**
     * Queries all calendars of the logged-in user's calendar home for an event with the given _uid_.
     *
     * @param calendarHomeId {String} The calendar home ID to search in
     * @param uid {String} The event UID to search.
     *
     * @return {Array} The array of dav:items
     */
    function getEventByUID(calendarHomeId, uid) {
      return request('report', calPathBuilder.forCalendarHomeId(calendarHomeId), JSON_CONTENT_TYPE_HEADER, { uid: uid }).then(davResponseHandler('dav:item'));
    }

    /**
     * Query one or more calendars for events. The dav:calendar resources will include their dav:item resources.
     * @param  {String}   calendarHomeId The calendarHomeId.
     * @param  {String}   calendarId     The calendarId.
     * @param  {calMoment} start          calMoment type of Date, specifying the start of the range.
     * @param  {calMoment} end            calMoment type of Date, specifying the end of the range.
     * @return {Object}                  An array of dav:item items.
     */
    function listEventsForCalendar(calendarHomeId, calendarId, start, end) {
      var body = {
        match: {
          start: start.format(CALENDAR_DAV_DATE_FORMAT),
          end: end.format(CALENDAR_DAV_DATE_FORMAT)
        }
      };
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendarId);

      return request('report', path, JSON_CONTENT_TYPE_HEADER, body).then(davResponseHandler('dav:item'));
    }

    /**
     * List all calendar homes and calendars in the calendar root. A dav:root resource, expanded down to all dav:home resouces.
     * @return {Object}            An array of dav:home items
     */
    function listAllCalendars(options) {
      var path = calPathBuilder.rootPath();

      return request('get', path + '/.json', {Accept: CALENDAR_ACCEPT_HEADER}, {}, options).then(davResponseHandler('dav:home'));
    }

    /**
     * List all calendars in the calendar home. A dav:home resource, containing all dav:calendar resources in it.
     * @param  {String} calendarId The calendarHomeId.
     * @param  {object} options    options for more data
     * @return {Object}                An array of dav:calendar
     */
    function listCalendars(calendarId, options) {
      var path = calPathBuilder.forCalendarHomeId(calendarId);

      return request('get', path, {Accept: CALENDAR_ACCEPT_HEADER}, {}, options).then(davResponseHandler('dav:calendar'));
    }

    /**
     * Get a calendar (dav:calendar).
     * @param  {String} calendarHomeId The calendarHomeId.
     * @param  {String} calendarId     The calendarId.
     * @return {Object} An array of dav:calendar
     */
    function getCalendar(calendarHomeId, calendarId) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendarId);

      return request('get', path, {Accept: CALENDAR_ACCEPT_HEADER}).then(responseHandler(200, _.property('data')));
    }

    /**
     * Create a calendar in the specified calendar home.
     * @param  {String}         calendarHomeId   The calendar home id in which to create a new calendar
     * @param  {ICAL.Component} calendar      A dav:calendar object, with an additional member "id" which specifies the id to be used in the calendar url.
     * @return {Object}                        the http response.
     */
    function createCalendar(calendarHomeId, calendar) {
      var path = calPathBuilder.forCalendarHomeId(calendarHomeId);

      return request('post', path, null, calendar).then(responseHandler(201));
    }

    /**
     * Delete a calendar in the specified calendar home.
     * @param  {String}         calendarHomeId   The calendar home id in which to delete a new calendar
     * @param  {ICAL.Component} calendarId      A dav:calendar object, with an additional member "id" which specifies the id to be used in the calendar url.
     * @return {Object}                        the http response.
     */
    function removeCalendar(calendarHomeId, calendarId) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendarId);

      return request('delete', path).then(responseHandler(204));
    }

    /**
     * Modify a calendar in the specified calendar home.
     * @param  {String}         calendarHomeId   The calendar home id in which to create a new calendar
     * @param  {ICAL.Component} calendar      A dav:calendar object, with an additional member "id" which specifies the id to be used in the calendar url.
     * @return {Object}                        the http response.
     */
    function modifyCalendar(calendarHomeId, calendar) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendar.id);

      return request('proppatch', path, JSON_CONTENT_TYPE_HEADER, calendar).then(responseHandler(204));
    }

    /**
     * Get right of this calendar
     * @param  {String}         calendarHomeId   The calendar home id in which to create a new calendar
     * @param  {ICAL.Component} calendar      A dav:calendar object, with an additional member "id" which specifies the id to be used in the calendar url.
     * @return {Object}                        the http response body.
     */
    function getRight(calendarHomeId, calendar) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendar.id);

      return request('propfind', path, JSON_CONTENT_TYPE_HEADER, {
        prop: ['cs:invite', 'acl']
      }).then(responseHandler(200, _.property('data')));
    }

    /**
     * Modify the public rights of a calendar in the specified calendar home.
     * @param  {String}  calendarHomeId  The calendar home id in which to create a new calendar
     * @param  {String} calendarId  The id of the calendar which its public right will be modified
     * @param  {Object} publicRights: the public rights
     * @return {Object} the http response body.
     */
    function modifyPublicRights(calendarHomeId, calendarId, publicRights) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendarId);

      return request('acl', path, JSON_CONTENT_TYPE_HEADER, publicRights).then(responseHandler(200));
    }

    /**
     * Modify the rights for a calendar in the specified calendar home.
     * @param  {String} calendarHomeId  The calendar home id in which to create a new calendar
     * @param  {String} calendarId  The id of the calendar which will be modified
     * @param  {Object} rights
     * @return {Object} the http response.
     */
    function modifyShares(calendarHomeId, calendarId, rights) {
      var path = calPathBuilder.forCalendarId(calendarHomeId, calendarId);

      return request('post', path, null, rights).then(responseHandler(200));
    }

    /**
     * PUT request used to create a new event in a specific calendar.
     * @param  {String}         eventPath path of the event. The form is /<calendar_path>/<uuid>.ics
     * @param  {ICAL.Component} vcalendar a vcalendar object including the vevent to create.
     * @param  {Object}         options   {graceperiod: true||false} specify if we want to use the graceperiod or not.
     * @return {String||Object}           a taskId if with use the graceperiod, the http response otherwise.
     */
    function create(eventPath, vcalendar, options) {
      var headers = {'Content-Type': CALENDAR_CONTENT_TYPE_HEADER};
      var body = vcalendar.toJSON();

      if (options.graceperiod) {
        return request('put', eventPath, headers, body, {graceperiod: CALENDAR_GRACE_DELAY}).then(gracePeriodResponseHandler);
      }

      return request('put', eventPath, headers, body).then(responseHandler(201));
    }

    /**
     * PUT request used to modify an event in a specific calendar.
     * @param  {String}         eventPath path of the event. The form is /<calendar_path>/<uuid>.ics
     * @param  {ICAL.Component} vcalendar a vcalendar object including the vevent to create.
     * @param  {String}         etag      set the If-Match header to this etag before sending the request
     * @return {String}                   the taskId which will be used to create the grace period.
     */
    function modify(eventPath, vcalendar, etag) {
      var headers = {
        'Content-Type': CALENDAR_CONTENT_TYPE_HEADER,
        Prefer: CALENDAR_PREFER_HEADER
      };

      if (etag) {
        headers['If-Match'] = etag;
      }

      var body = vcalendar.toJSON();

      return request('put', eventPath, headers, body, { graceperiod: CALENDAR_GRACE_DELAY }).then(gracePeriodResponseHandler);
    }

    /**
     * DELETE request used to remove an event in a specific calendar.
     * @param  {String} eventPath path of the event. The form is /<calendar_path>/<uuid>.ics
     * @param  {String} etag      set the If-Match header to this etag before sending the request
     * @return {String}           the taskId which will be used to create the grace period.
     */
    function remove(eventPath, etag) {
      var headers = {'If-Match': etag};

      return request('delete', eventPath, headers, null, { graceperiod: CALENDAR_GRACE_DELAY }).then(gracePeriodResponseHandler);
    }

    /**
     * PUT request used to change the participation status of an event
     * @param  {String}         eventPath path of the event. The form is /<calendar_path>/<uuid>.ics
     * @param  {ICAL.Component} vcalendar a vcalendar object including the vevent to create.
     * @param  {String}         etag      set the If-Match header to this etag before sending the request
     * @return {Object}                   the http response.
     */
    function changeParticipation(eventPath, vcalendar, etag) {
      var headers = {
        'Content-Type': CALENDAR_CONTENT_TYPE_HEADER,
        Prefer: CALENDAR_PREFER_HEADER
      };

      if (etag) {
        headers['If-Match'] = etag;
      }
      var body = vcalendar.toJSON();

      return request('put', eventPath, headers, body).then(responseHandler([200, 204]));
    }
  }
})();
