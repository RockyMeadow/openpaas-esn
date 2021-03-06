(function() {
  'use strict';

  /**
   * There are 3 types of form in the module:
   *   * The quick form: this is a desktop only view of an edition form for events.
   *   * The full form: this is a desktop and mobile view of an complete edition form for events.
   *   * The consult form: this is a desktop and mobile view of an consult form for events.
   * Note that mobile devices have only access to the full form and the consult form.
   * This service will open the correct form corresponding to the event and the screen size.
   */
  angular.module('esn.calendar')
    .factory('calOpenEventForm', calOpenEventForm);

  function calOpenEventForm($rootScope, $modal, $state, matchmedia, calendarService, calEventUtils, calendarAuthorizationHelper, SM_XS_MEDIA_QUERY, CALENDAR_EVENTS, CALENDAR_AUTHORIZATIONS) {
    var modalIsOpen = false;

    return function calOpenEventForm(event) {
      if (!calendarAuthorizationHelper.isAllowedTo(CALENDAR_AUTHORIZATIONS.ACCESS_EVENT_DETAIL, event)) {
        return;
      }

      if (!event.isInstance()) {
        _openForm(event);
      } else {
        _openRecurringModal(event);
      }
    };

    ////////////

    function _openForm(event) {
      calEventUtils.setEditedEvent(event);
      if (matchmedia.is(SM_XS_MEDIA_QUERY)) {
        if (calEventUtils.isOrganizer(event)) {
          $state.go('calendar.event.form', {calendarHomeId: calendarService.calendarHomeId, eventId: event.id});
        } else {
          $state.go('calendar.event.consult', {calendarHomeId: calendarService.calendarHomeId, eventId: event.id});
        }
      } else if (modalIsOpen === false) {
        modalIsOpen = true;
        $modal({
          templateUrl: '/calendar/app/services/open-event-form/event-quick-form-view',
          resolve: {
            event: function(calEventUtils) {
              return calEventUtils.getEditedEvent();
            }
          },
          controller: function($scope, event) {
            var _$hide = $scope.$hide;

            var unregister = $rootScope.$on(CALENDAR_EVENTS.MODAL + '.hide', function() {
              $rootScope.$broadcast(CALENDAR_EVENTS.CALENDAR_UNSELECT);
              $scope.$hide();
            });

            $scope.$hide = function() {
              _$hide.apply(this, arguments);
              modalIsOpen = false;
              unregister && unregister();
            };

            $scope.event = event;
          },
          backdrop: 'static',
          placement: 'center',
          prefixEvent: CALENDAR_EVENTS.MODAL
        });
      }
    }

    function _openRecurringModal(event) {
      $modal({
        templateUrl: '/calendar/app/services/open-event-form/edit-instance-or-series',
        resolve: {
          event: function() {
            return event;
          },
          openForm: function() {
            return _openForm;
          }
        },
        controller: function($scope, event, openForm) {
          $scope.event = event;
          $scope.editAllInstances = function() {
            $scope.$hide();
            event.getModifiedMaster().then(openForm);
          };

          $scope.editInstance = function() {
            $scope.$hide();
            openForm(event);
          };
        },
        openForm: _openForm,
        placement: 'center'
      });
    }
  }
})();
