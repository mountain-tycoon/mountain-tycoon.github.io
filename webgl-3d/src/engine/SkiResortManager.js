import { isCliff } from './utils';
import { generateGuestName, JACKET_COLORS, PANTS_COLORS, HELMET_COLORS } from '../constants/guestNames';
import { GUEST_CATEGORIES } from '../constants/guests';

/**
 * GUEST SYSTEM
 * Individual visitors with needs and AI
 */
export class Guest {
    constructor(id, car, manager) {
        this.id = id;
        this.car = car;

        // Personal
        this.gender = Math.random() < 0.5 ? 'M' : 'F';
        this.name = generateGuestName(this.gender);

        // Appearance
        this.jacketColor = JACKET_COLORS[Math.floor(Math.random() * JACKET_COLORS.length)];
        this.pantsColor = PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)];
        this.helmetColor = HELMET_COLORS[Math.floor(Math.random() * HELMET_COLORS.length)];

        // Position
        this.x = car.x;
        this.y = car.y;
        this.z = 0;

        // State
        this.state = 'WALKING';
        this.target = null;
        this.speed = 1.5;

        // Movement
        this.progress = 0;
        this.startPos = { x: this.x, y: this.y };
        this.targetPos = { x: this.x, y: this.y };
        this.duration = 1.0;

        // Ticket System
        this.hasLiftPass = false;
        this.needsLiftPass = true;
        this.queuePosition = -1; // -1 = not in queue
        const plannedStayDays = car?.plannedStayDays || (1 + Math.floor(Math.random() * 14));
        this.passDuration = Math.max(1, plannedStayDays); // usually shared per vehicle group
        this.passDaysRemaining = this.passDuration;

        // Guest Category / Personality
        this.categoryKey = Guest.pickCategoryKey();
        this.category = GUEST_CATEGORIES[this.categoryKey];
        const initialMoney = Math.round((150 + Math.random() * 850) * (this.category?.spendingPower || 1.0));
        const passPrice = (manager?.getSkiPassPrice ? manager.getSkiPassPrice() : (manager?.customSkiPassPrice || manager?.baseSkiPassPrice || 75));
        const required = passPrice * this.passDuration * 2;
        this.money = Math.max(initialMoney, Math.round(required));
        this.wishes = Guest.buildWishes(this.category);
        this.completedWishes = [];
        this.slopePreference = Guest.pickSlopePreference();
        this.satisfaction = Math.round(60 + Math.random() * 30);
        this.nextAction = 'Ticketkasse';
        this.serviceTimer = 0;
        this.postTicketStep = null; // 'TO_WINDOW' | 'TO_CLUSTER' | null
        this.hunger = 5 + Math.random() * 8;      // guests arrive quite full
        this.thirst = 8 + Math.random() * 10;     // guests arrive hydrated
        this.bladder = 8 + Math.random() * 12;    // and not urgent for toilet
        this.unmetHungerSec = 0;
        this.unmetThirstSec = 0;
        this.unmetBladderSec = 0;
        this.needTargetType = null;               // 'FOOD' | 'TOILET' | null
        this.needTargetBuildingId = null;
        this.serviceType = null;
        this.serviceBuildingId = null;
        this.serviceRemainingSec = 0;
        this.hotelBuildingId = null;
        this.hotelCheckInPending = false;
        this.liftTargetId = null;
        this.rideLiftId = null;
        this.rideProgress = 0;
        this.rideDurationSec = 0;
        this.rideReverse = false; // true = Talfahrt (Lift abwärts)
        this.liftRideCooldownSec = 0;
        this.rideCarrierSlot = -1;
        this.postRideStep = null; // 'TO_PISTE_START' | 'SKI_DOWN' | null
        this.postRideEndPoint = null;
        this.postRideRoute = null;
        this.activePisteId = null;
        this.riddenLiftIds = new Set();
        this.riddenPisteIds = new Set();
        this.preferNextLift = false;
        this.liftQueueLiftId = null;
        this.liftQueueIndex = -1;
        this.liftQueueWaitSec = 0;
        this.skiSkill = this.computeSkiSkill();
        this.skiSpeed = 1.5 + this.skiSkill * 2.1; // beginners slower, advanced faster
        this.skiTurnAmplitude = 0.12 + Math.random() * 0.33;
        this.skiTurnFrequency = 0.7 + Math.random() * 1.0;
        this.skiOscPhase = Math.random() * Math.PI * 2;
        this.skiRoute = null;
        this.skiRouteCumLen = null;
        this.skiRouteLength = 0;
        this.skiDistance = 0;
        this.skiLean = 0;
        this.exploreFarBias = 0.65 + Math.random() * 1.35;
        this.exploreLiftBias = 1.15 + Math.random() * 1.55;
        this.explorePisteBias = 1.2 + Math.random() * 1.65;
        this.branchCuriosity = 0.45 + Math.random() * 1.2;
        this.repeatTolerance = 0.15 + Math.random() * 0.85;
        this.flowPreference = Math.random();
        this.noveltyJoy = 0.8 + Math.random() * 1.4;
        this.areaWanderlust = 0.8 + Math.random() * 1.25;
        this.branchCheckTimer = 0;
        this.lastHotelVisitDay = 0;
        this.expiryDespawnAtSec = null;
        this.departureRequested = false;
        this.departureStarted = false;
        this.departureTimer = 0;
        this.departureRepathTimer = 0;
        this.returnVehicleOffset = {
            x: ((this.id % 3) - 1) * 0.5,
            y: (((this.id + 1) % 3) - 1) * 0.5
        };

        // Flags
        this.shouldRemove = false; // NEVER remove guests!
        this.hasSkis = false;

        // Pathing
        this.path = [];
        this.targetPos = null;
        this.atTarget = false;
        this.blocked = false;
        this.blockedTimer = 0;
        this.walkPhase = Math.random() * Math.PI * 2;
    }

    update(dt, manager, gridSize) {
        const dtSec = dt / 1000;
        this.liftRideCooldownSec = Math.max(0, (this.liftRideCooldownSec || 0) - dtSec);

        if (this.departureRequested) {
            this.updateDeparture(dtSec, manager, gridSize);
            return;
        }

        if (this.state === 'RIDING_LIFT') {
            this.updateLiftRide(dtSec, manager, gridSize);
            return;
        }
        if (this.state === 'SKIING') {
            this.updateSkiing(dtSec, manager, gridSize);
            return;
        }
        if (this.state === 'IN_SERVICE') {
            this.updateServiceVisit(dtSec, manager, gridSize);
            return;
        }
        this.syncToTerrain(manager, gridSize);

        if (this.hasLiftPass && !this.shouldRemove) {
            this.updateNeeds(dtSec);
            this.applyNeedSatisfactionPenalty(dtSec);
            this.updateHotelPressure(dtSec, manager, gridSize);
            // Baseline decay: guests should generally lose satisfaction unless they ski or fulfill wishes.
            this.satisfaction = Math.max(0, this.satisfaction - dtSec * 0.012);
        }

        if (
            this.state === 'WALKING' &&
            this.hasLiftPass &&
            !this.needTargetType &&
            !this.postTicketStep &&
            !this.postRideStep &&
            (this.hunger >= 46 || this.thirst >= 40 || this.bladder >= 54)
        ) {
            this.decideNextNeedTarget(manager, gridSize);
        }

        // PRIORITY 1: Get lift pass if needed
        if (this.needsLiftPass && !this.hasLiftPass) {
            const ticketOffice = manager.buildings.find(b => b.type.id === 'ticket_office');

            if (ticketOffice) {
                this.nextAction = 'Ticketkasse';

                // Initialize queue if not exists
                if (!ticketOffice.guestQueue) {
                    ticketOffice.guestQueue = [];
                }

                // Join queue if not already in it
                if (this.queuePosition === -1) {
                    this.queuePosition = ticketOffice.guestQueue.length;
                    ticketOffice.guestQueue.push(this);
                    this.state = 'QUEUE';
                    this.setTarget(manager, gridSize, this.getQueueTarget(ticketOffice, manager, gridSize));
                }

                // Process queue
                if (this.state === 'QUEUE') {
                    // Always retarget to keep queue positions stable and migrate old targets.
                    this.setTarget(manager, gridSize, this.getQueueTarget(ticketOffice, manager, gridSize));
                    if (this.blocked) {
                        const fallback = this.getQueueFallbackTarget(ticketOffice, manager, gridSize);
                        if (fallback) this.setTarget(manager, gridSize, fallback);
                    }
                    // Move to queue position
                    const reachedQueue = this.advanceMovement(dtSec, gridSize);
                    this.walkPhase += dtSec * 8;

                    if (reachedQueue) {
                        if (this.blocked) {
                            this.satisfaction = Math.max(0, this.satisfaction - 2);
                        }

                        // Check if at front of queue
                        if (ticketOffice.guestQueue[0] === this) {
                            this.nextAction = 'Liftpass kaufen';
                            if (this.serviceTimer <= 0) {
                                this.serviceTimer = 1.5 + Math.random() * 1.0; // small service delay
                            }
                            this.serviceTimer -= dtSec;
                            if (this.serviceTimer <= 0) {
                                let plannedDuration = Math.max(1, this.passDuration || 1);
                                let hotel = null;

                                if (plannedDuration > 1) {
                                    hotel = manager.findAvailableHotelForGuest(this, plannedDuration);
                                }

                                // Charge money (multi-day pass)
                                const dailyPrice = manager.customSkiPassPrice || manager.baseSkiPassPrice || 75;
                                let totalPrice = dailyPrice * plannedDuration;

                                if (hotel && plannedDuration > 1) {
                                    const hotelTotal = manager.getHotelStayCost(hotel, plannedDuration);
                                    if (this.money - totalPrice < hotelTotal) {
                                        hotel = null;
                                    }
                                }

                                if (this.money < totalPrice * 2) {
                                    this.money = Math.ceil(totalPrice * 2);
                                }

                                // Buy ticket!
                                this.money -= totalPrice;
                                this.hasLiftPass = true;
                                this.needsLiftPass = false;
                                this.passDuration = plannedDuration;
                                this.passDaysRemaining = plannedDuration;
                                ticketOffice.guestQueue.shift(); // Remove from queue
                                this.queuePosition = -1;

                                if (hotel && plannedDuration > 1) {
                                    const hotelTotal = manager.getHotelStayCost(hotel, plannedDuration);
                                    this.money -= hotelTotal;
                                    manager.earn(hotelTotal, 'hotel');
                                    this.hotelBuildingId = hotel.id;
                                    this.hotelCheckInPending = true;
                                } else {
                                    this.hotelBuildingId = null;
                                    this.hotelCheckInPending = false;
                                }

                                manager.earn(totalPrice, 'skipass');
                                manager.skiPassSales++;
                                manager.skiPassSalesToday = (manager.skiPassSalesToday || 0) + 1;

                                // Global guest counter
                                if (!manager.totalGuestsServed) manager.totalGuestsServed = 0;
                                manager.totalGuestsServed++;
                                // No generic mood boost on purchase; satisfaction should mainly come from skiing/wishes.

                                // 1) Everyone passes the counter window first
                                this.state = 'WALKING';
                                this.postTicketStep = 'TO_WINDOW';
                                this.nextAction = 'Zum Schalterfenster';
                                const windowSpot = this.getCounterWindowSpot(ticketOffice, manager);
                                this.setTarget(manager, gridSize, windowSpot);
                            }
                        } else {
                            this.nextAction = 'Anstellen';
                            // Not at front yet - update queue position as others leave
                            const currentIndex = ticketOffice.guestQueue.indexOf(this);
                            if (currentIndex !== -1 && currentIndex !== this.queuePosition) {
                                // Position changed in queue - move forward
                                this.queuePosition = currentIndex;
                                this.setTarget(manager, gridSize, this.getQueueTarget(ticketOffice, manager, gridSize));
                                if (this.blocked) {
                                    const fallback = this.getQueueFallbackTarget(ticketOffice, manager, gridSize);
                                    if (fallback) this.setTarget(manager, gridSize, fallback);
                                }
                            }
                        }
                    }

                    // Unstuck logic if still blocked after trying targets
                    if (this.blocked) {
                        this.blockedTimer += dtSec;
                        if (this.blockedTimer > 1.5) {
                            const unstuck = this.getUnstuckTarget(manager, gridSize, ticketOffice);
                            if (unstuck) this.setTarget(manager, gridSize, unstuck);
                            this.blockedTimer = 0;
                        }
                    } else {
                        this.blockedTimer = 0;
                    }
                }
            } else {
                // No ticket office yet - wait/wander
                this.state = 'WAITING';
                this.nextAction = 'Ticketkasse fehlt';
            }
        } else if (this.state === 'WALKING') {
            if (this.hasLiftPass && this.liftTargetId && !this.postTicketStep && !this.needTargetType && !this.postRideStep) {
                const boardedEarly = this.processLiftQueue(dtSec, manager, gridSize);
                if (boardedEarly) return;
            }

            // Normal movement
            const reached = this.advanceMovement(dtSec, gridSize);
            this.walkPhase += dtSec * 8;

            // If we have a lift pass and reached destination, start waiting
            if (reached && this.hasLiftPass) {
                if (this.needTargetType && !this.postTicketStep) {
                    this.fulfillNeedAtTarget(manager, gridSize);
                    return;
                }
                if (this.postRideStep === 'TO_PISTE_START') {
                    if (this.postRideRoute && this.beginSkiRun()) {
                        this.postRideStep = 'SKI_DOWN';
                        return;
                    }
                    this.postRideStep = null;
                    this.postRideEndPoint = null;
                    this.postRideRoute = null;
                    this.state = 'WAITING';
                    this.nextAction = 'Piste suchen';
                    return;
                }
                if (this.postRideStep === 'SKI_DOWN') {
                    this.postRideStep = null;
                    this.postRideEndPoint = null;
                    this.postRideRoute = null;
                    this.hasSkis = false;
                    this.activePisteId = null;
                    this.state = 'WAITING';
                    this.nextAction = 'Piste beendet';
                    this.liftRideCooldownSec = Math.max(this.liftRideCooldownSec, 8);
                    this.preferNextLift = true;
                    return;
                }
                if (this.liftTargetId && !this.postTicketStep && !this.needTargetType) {
                    const boarded = this.processLiftQueue(dtSec, manager, gridSize);
                    if (boarded) return;
                }
                const ticketOffice = manager.buildings.find(b => b.type.id === 'ticket_office');
                if (this.postTicketStep === 'TO_WINDOW' && ticketOffice) {
                    // 2) Then move to a cluster beside the ticket area
                    this.postTicketStep = 'TO_CLUSTER';
                    this.nextAction = 'In Wartegruppe';
                    const clusterSpot = this.getWaitingClusterSpot(ticketOffice, manager);
                    this.setTarget(manager, gridSize, clusterSpot);
                } else if (this.postTicketStep === 'TO_CLUSTER') {
                    // 3) Done: wait and prepare to search lifts
                    this.postTicketStep = null;
                    this.state = 'WAITING';
                    this.nextAction = Math.random() < 0.8 ? 'Lift suchen' : 'Aktivität suchen';
                } else {
                    this.state = 'WAITING';
                    this.nextAction = Math.random() < 0.8 ? 'Lift suchen' : 'Aktivität suchen';
                }
            }

            if (this.blocked) {
                this.blockedTimer += dtSec;
                if (this.blockedTimer > 1.5) {
                    const unstuck = this.getUnstuckTarget(manager, gridSize, null);
                    if (unstuck) this.setTarget(manager, gridSize, unstuck);
                    this.blockedTimer = 0;
                }
            } else {
                this.blockedTimer = 0;
            }
        }

        if (this.state === 'WAITING' && this.hasLiftPass) {
            if (!this.nextAction || this.nextAction === 'Wartebereich') {
                this.nextAction = Math.random() < 0.8 ? 'Lift suchen' : 'Aktivität suchen';
            }

            if (!this.postTicketStep && !this.needTargetType) {
                if (this.liftRideCooldownSec <= 0) this.decideNextNeedTarget(manager, gridSize);
            }
        }

        this.syncToTerrain(manager, gridSize);
    }

    onDayPassed(manager) {
        if (!this.hasLiftPass || this.shouldRemove) return;
        this.passDaysRemaining = Math.max(0, (this.passDaysRemaining || 0) - 1);
        if (this.passDaysRemaining <= 0) {
            this.nextAction = 'Abreise';
            this.hasLiftPass = false;
            this.needsLiftPass = false;
            this.leaveLiftQueue(manager);
            this.needTargetType = null;
            this.needTargetBuildingId = null;
            this.serviceType = null;
            this.serviceBuildingId = null;
            this.serviceRemainingSec = 0;
            this.liftTargetId = null;
            this.rideLiftId = null;
            this.rideCarrierSlot = -1;
            this.rideProgress = 0;
            this.rideDurationSec = 0;
            this.postRideStep = null;
            this.postRideRoute = null;
            this.skiRoute = null;
            this.skiRouteCumLen = null;
            this.skiRouteLength = 0;
            this.skiDistance = 0;
            this.activePisteId = null;
            this.hasSkis = false;
            this.state = 'WALKING';
            this.departureRequested = true;
            this.departureStarted = false;
            this.departureTimer = 0;
            this.departureRepathTimer = 0;
            this.expiryDespawnAtSec = null;
            if (this.car) this.car.requestDeparture = true;
        }
    }

    updateHotelPressure(dtSec, manager, gridSize) {
        if (!this.hasLiftPass || this.passDaysRemaining <= 1) return;
        const dayProgress = manager.getDayCycleProgress ? manager.getDayCycleProgress() : 0;

        if (!this.hotelBuildingId) {
            if (dayProgress >= 0.76) {
                const hotel = manager.findAvailableHotelForGuest(this, this.passDaysRemaining || this.passDuration || 1);
                if (hotel) {
                    const hotelTotal = manager.getHotelStayCost(hotel, this.passDaysRemaining || this.passDuration || 1);
                    if (this.money >= hotelTotal) {
                        this.money -= hotelTotal;
                        manager.earn(hotelTotal, 'hotel');
                        this.hotelBuildingId = hotel.id;
                        this.hotelCheckInPending = true;
                    }
                }
            }

            if (!this.hotelBuildingId) {
                const penaltyScale = dayProgress >= 0.92 ? 0.22 : dayProgress >= 0.82 ? 0.14 : dayProgress >= 0.72 ? 0.05 : 0;
                if (penaltyScale > 0) {
                    this.satisfaction = Math.max(0, this.satisfaction - penaltyScale * dtSec);
                    this.nextAction = 'Braucht Hotel';
                }
            }
        }

        if (
            this.hotelBuildingId &&
            dayProgress >= 0.8 &&
            this.lastHotelVisitDay !== (manager.getCurrentDayNumber ? manager.getCurrentDayNumber() : 1) &&
            !this.needTargetType &&
            !this.postRideStep &&
            this.state !== 'IN_SERVICE'
        ) {
            const hotel = manager.buildings.find(b => b.id === this.hotelBuildingId);
            if (hotel) {
                if (this.tryTravelTowardBuildingViaNetwork(manager, gridSize, hotel, {
                    actionLabel: 'Zum Hotel abfahren',
                    directWalkDistance: 20,
                    minDownhillDelta: 4
                })) {
                    return;
                }
                this.leaveLiftQueue(manager);
                this.needTargetType = 'HOTEL';
                this.needTargetBuildingId = hotel.id;
                this.state = 'WALKING';
                this.nextAction = 'Zum Hotel (Tagesende)';
                this.setTarget(manager, gridSize, this.getBuildingAccessSpot(hotel, manager));
            }
        }
    }

    updateNeeds(dtSec) {
        this.hunger = Math.min(100, this.hunger + dtSec * (100 / (14 * 60)));
        this.thirst = Math.min(100, this.thirst + dtSec * (100 / (8 * 60)));
        this.bladder = Math.min(100, this.bladder + dtSec * (100 / (35 * 60)));

        if (this.hunger >= 52) this.unmetHungerSec += dtSec;
        else this.unmetHungerSec = Math.max(0, this.unmetHungerSec - dtSec * 2);

        if (this.thirst >= 48) this.unmetThirstSec += dtSec;
        else this.unmetThirstSec = Math.max(0, this.unmetThirstSec - dtSec * 2);

        if (this.bladder >= 60) this.unmetBladderSec += dtSec;
        else this.unmetBladderSec = Math.max(0, this.unmetBladderSec - dtSec * 2);
    }

    applyNeedSatisfactionPenalty(dtSec) {
        let penalty = 0;
        if (this.hunger > 58) penalty += ((this.hunger - 58) / 42) * 0.045;
        if (this.thirst > 52) penalty += ((this.thirst - 52) / 48) * 0.065;
        if (this.bladder > 60) penalty += ((this.bladder - 60) / 40) * 0.05;
        if (this.unmetHungerSec > 180) penalty += 0.015;
        if (this.unmetThirstSec > 140) penalty += 0.02;
        if (this.unmetBladderSec > 120) penalty += 0.03;
        this.satisfaction = Math.max(0, this.satisfaction - penalty * dtSec);
    }

    decideNextNeedTarget(manager, gridSize) {
        const toiletUrgent = this.bladder >= 64;
        const dayProgress = manager.getDayCycleProgress ? manager.getDayCycleProgress() : 0.5;
        const lunchWindow = dayProgress >= 0.22 && dayProgress <= 0.78;
        const hungerUrgent = this.hunger >= 40;
        const thirstUrgent = this.thirst >= 36;
        const lunchBreak = !toiletUrgent && lunchWindow && (this.hunger >= 26 || this.thirst >= 24) && Math.random() < (0.34 + this.flowPreference * 0.18);
        const comfortBreak = !toiletUrgent && !hungerUrgent && !thirstUrgent && !lunchBreak && (this.hunger >= 30 || this.thirst >= 26 || this.bladder >= 40) && Math.random() < 0.42;

        if (!toiletUrgent && !hungerUrgent && !thirstUrgent && !lunchBreak && !comfortBreak) {
            if (this.seekNearestLift(manager, gridSize, {
                preferUnseen: true,
                preferHigherElevation: true,
                originZ: this.z || 0,
                maxUphillClimb: 6,
                maxDistance: 15
            })) {
                this.preferNextLift = false;
                return;
            }
            // If no lift is directly nearby, allow a longer walk across the valley/base area,
            // but still prevent dumb uphill hiking through the mountain.
            if (this.seekNearestLift(manager, gridSize, {
                preferUnseen: true,
                preferHigherElevation: true,
                originZ: this.z || 0,
                maxUphillClimb: 2,
                maxDistance: 72
            })) {
                this.preferNextLift = false;
                this.nextAction = 'Zum Tal-Lift';
                return;
            }
            this.nextAction = Math.random() < 0.8 ? 'Lift suchen' : 'Aktivität suchen';
            return;
        }

        if (toiletUrgent) {
            const toilet = this.findBestNeedBuilding(manager, (b) => b.type.id === 'toilettenhauschen', {
                maxDistance: 20,
                occupancyWeight: 14
            });
            const fallbackToilet = toilet || this.findBestNeedBuilding(manager, (b) => b.type.id === 'toilettenhauschen', {
                occupancyWeight: 14
            });
            if (!toilet && fallbackToilet && this.tryTravelTowardBuildingViaNetwork(manager, gridSize, fallbackToilet, {
                actionLabel: 'Zur Toilette abfahren'
            })) {
                return;
            }
            const chosenToilet = toilet || fallbackToilet;
            if (chosenToilet) {
                this.leaveLiftQueue(manager);
                this.needTargetType = 'TOILET';
                this.needTargetBuildingId = chosenToilet.id;
                this.state = 'WALKING';
                this.nextAction = 'Toilette suchen';
                this.setTarget(manager, gridSize, this.getBuildingAccessSpot(chosenToilet, manager));
                return;
            }
            this.nextAction = 'Braucht Toilette';
            return;
        }

        if (hungerUrgent || thirstUrgent || lunchBreak || comfortBreak) {
            const gastro = this.findBestNeedBuilding(manager, (b) => b.type.category === 'gastronomy', {
                maxDistance: 34,
                occupancyWeight: 4.5,
                includePrice: true,
                priceWeight: this.category?.priceSensitivity ? 0.015 * this.category.priceSensitivity : 0.012,
                maxUphillDelta: 5
            });
            const fallbackGastro = gastro || this.findBestNeedBuilding(manager, (b) => b.type.category === 'gastronomy', {
                occupancyWeight: 5.5,
                includePrice: true,
                priceWeight: this.category?.priceSensitivity ? 0.015 * this.category.priceSensitivity : 0.012,
                maxUphillDelta: 7
            });
            if (!gastro && fallbackGastro && this.tryTravelTowardBuildingViaNetwork(manager, gridSize, fallbackGastro, {
                actionLabel: (comfortBreak || lunchBreak) ? 'Zur Gastro abfahren' : 'Zur Gastro weiterfahren',
                directWalkDistance: 24,
                minDownhillDelta: 2,
                maxEntryDist: 26,
                allowUphillDelta: 12
            })) {
                return;
            }
            const chosenGastro = gastro || fallbackGastro;
            if (chosenGastro) {
                const gastroTarget = this.getBuildingAccessSpot(chosenGastro, manager);
                const gastroDist = Math.abs((this.x || 0) - gastroTarget.x) + Math.abs((this.y || 0) - gastroTarget.y);
                if (gastroDist > 26 && this.tryTravelTowardBuildingViaNetwork(manager, gridSize, chosenGastro, {
                    actionLabel: (comfortBreak || lunchBreak) ? 'Zur Gastro abfahren' : 'Zur Gastro weiterfahren',
                    directWalkDistance: 24,
                    minDownhillDelta: 1,
                    maxEntryDist: 26,
                    allowUphillDelta: 12
                })) {
                    return;
                }
                this.leaveLiftQueue(manager);
                this.needTargetType = 'FOOD';
                this.needTargetBuildingId = chosenGastro.id;
                this.state = 'WALKING';
                this.nextAction = lunchBreak
                    ? 'Mittagspause'
                    : comfortBreak
                    ? 'Kurze Gastro-Pause'
                    : hungerUrgent && thirstUrgent
                    ? 'Hunger & Durst: Gastronomie'
                    : thirstUrgent
                        ? 'Durst: Gastronomie'
                        : 'Hunger: Gastronomie';
                this.setTarget(manager, gridSize, this.getBuildingAccessSpot(chosenGastro, manager));
                return;
            }
            this.nextAction = thirstUrgent ? 'Durst: kein Angebot' : 'Hunger: kein Angebot';
        }
    }

    seekNearestLift(manager, gridSize, options = {}) {
        const origin = options.originPoint || { x: this.x, y: this.y };
        const candidate = this.pickLiftCandidate(manager, origin, options);
        if (!candidate) return false;

        this.leaveLiftQueue(manager);
        const jitterX = ((this.id * 17) % 7 - 3) * 0.12;
        const jitterY = ((this.id * 29) % 7 - 3) * 0.12;
        this.state = 'WALKING';
        this.nextAction = 'Zum nächsten Lift';
        this.liftTargetId = candidate.lift.id;
        this.setTarget(manager, gridSize, {
            x: candidate.start.x + 0.5 + jitterX,
            y: candidate.start.y + 0.5 + jitterY
        });
        return true;
    }

    pickLiftCandidate(manager, originPoint, options = {}) {
        if (!manager?.lifts?.length || !originPoint) return null;

        const candidates = [];
        const maxDistance = options.maxDistance ?? 18;
        const preferUnseen = options.preferUnseen !== false;
        const excludeLiftId = options.excludeLiftId ?? null;
        const preferHigherElevation = !!options.preferHigherElevation;
        const originZ = Number.isFinite(options.originZ) ? options.originZ : (this.z || 0);
        const maxUphillClimb = Number.isFinite(options.maxUphillClimb) ? options.maxUphillClimb : 6;
        const hasUnseen = preferUnseen && manager.lifts.some(l => l && !this.riddenLiftIds.has(l.id) && (!excludeLiftId || l.id !== excludeLiftId));

        for (const lift of manager.lifts) {
            if (!lift) continue;
            if (excludeLiftId && lift.id === excludeLiftId) continue;

            const start = lift.startTile || lift.start;
            if (!start) continue;

            const d = Math.abs(originPoint.x - start.x) + Math.abs(originPoint.y - start.y);
            if (d > maxDistance) continue;
            const climb = (start?.z || 0) - originZ;
            if (climb > maxUphillClimb) continue;

            const seen = this.riddenLiftIds.has(lift.id);
            const seenPenalty = (preferUnseen && seen) ? (hasUnseen ? (20 + this.exploreLiftBias * 10) : (5 + this.repeatTolerance * 4)) : 0;
            const sameLiftPenalty = (seen && lift.id === this.liftTargetId) ? (4 + this.repeatTolerance * 4) : 0;
            const end = lift.endTile || lift.end;
            const queuePenalty = Math.min(18, (lift.guestQueue?.length || 0) * 0.95);
            const liftCrowdPenalty = this.getLiftCrowding(manager, lift, start, end) * (0.75 + this.areaWanderlust * 0.28);
            const uphillPenalty = Math.max(0, climb) * 1.3;
            const elevationBonus = preferHigherElevation ? -Math.max(0, climb) * 0.9 : 0;
            const noveltyBonus = (!seen && preferUnseen) ? -(6 + this.exploreLiftBias * 4.8) : 0;
            const downstreamRoute = end ? this.findConnectedDownhillRoute(manager, end, null, {
                maxEntryDist: 24,
                allowUphillDelta: 10
            }) : null;
            const networkBonus = downstreamRoute?.pisteId && !this.riddenPisteIds.has(downstreamRoute.pisteId)
                ? -(6 + this.explorePisteBias * 3.6)
                : 0;
            const spreadBonus = preferUnseen
                ? -Math.min(48, d) * 0.12 * this.exploreFarBias * this.exploreLiftBias
                : -Math.min(22, d) * 0.045 * this.exploreFarBias;
            const randomJitter = (Math.random() - 0.5) * (preferUnseen ? (7.5 * this.repeatTolerance) : 3.2);
            const score = d + seenPenalty + sameLiftPenalty + queuePenalty + liftCrowdPenalty + uphillPenalty + elevationBonus + noveltyBonus + networkBonus + spreadBonus + randomJitter;

            candidates.push({ lift, start, distance: d, score, seen });
        }

        if (!candidates.length) return null;

        candidates.sort((a, b) => {
            if (a.distance !== b.distance) return a.distance - b.distance;
            return a.score - b.score;
        });

        const nearest = candidates[0];
        const nearestDistance = nearest.distance;
        const localVariationRadius = options.localVariationRadius ?? 15; // ~300 m
        const clusterSlack = options.localVariationSlack ?? 5;
        let pool = candidates.filter((candidate) => {
            const liftSpacing =
                Math.abs((candidate.start?.x || 0) - (nearest.start?.x || 0)) +
                Math.abs((candidate.start?.y || 0) - (nearest.start?.y || 0));
            return liftSpacing <= localVariationRadius && candidate.distance <= nearestDistance + clusterSlack;
        });
        if (pool.length <= 1) {
            pool = candidates.filter(c => c.distance <= nearestDistance + 1.5);
        }
        if (pool.length === 0) pool = [candidates[0]];
        if (pool.length === 1) return pool[0];

        pool.sort((a, b) => a.score - b.score);
        const bestScore = pool[0].score;

        let weightSum = 0;
        const weighted = pool.map(c => {
            const distanceWeight = 1 / (1 + Math.max(0, c.distance - nearestDistance) * 0.85);
            const scoreWeight = 1 / (1 + Math.max(0, c.score - bestScore) * 0.22);
            const unseenBoost = (preferUnseen && !c.seen) ? 1.22 : 0.92;
            const w = distanceWeight * scoreWeight * unseenBoost;
            weightSum += w;
            return { c, w };
        });

        let roll = Math.random() * weightSum;
        for (const item of weighted) {
            roll -= item.w;
            if (roll <= 0) return item.c;
        }
        return weighted[0].c;
    }

    leaveLiftQueue(manager) {
        if (!this.liftQueueLiftId) return;
        const lift = manager?.lifts?.find(l => l.id === this.liftQueueLiftId);
        if (lift?.guestQueue) {
            lift.guestQueue = lift.guestQueue.filter(g => g && g.id !== this.id);
        }
        this.liftQueueLiftId = null;
        this.liftQueueIndex = -1;
        this.liftQueueWaitSec = 0;
    }

    getLiftQueueTarget(start, end, queueIndex, gridSize) {
        const sx = (start?.x || 0) + 0.5;
        const sy = (start?.y || 0) + 0.5;
        const dx = (end?.x || sx) - (start?.x || sx);
        const dy = (end?.y || sy) - (start?.y || sy);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const backX = -dx / len;
        const backY = -dy / len;
        const sideX = -backY;
        const sideY = backX;

        // Keep the first guest at the boarding position, all others in a compact "pulk".
        let depth = 0.58;
        let side = 0;
        if (queueIndex > 0) {
            const idx = queueIndex;
            const goldenAngle = 2.399963229728653;
            const r = 0.34 + Math.sqrt(idx) * 0.23;
            const angle = idx * goldenAngle + (this.id % 9) * 0.07;
            const spreadSide = Math.cos(angle) * r * 1.22;
            const spreadBack = Math.abs(Math.sin(angle)) * r * 0.82;

            depth = 1.0 + spreadBack;
            side = spreadSide;
        }

        return {
            x: Math.max(0.5, Math.min(gridSize - 1.5, sx + backX * depth + sideX * side)),
            y: Math.max(0.5, Math.min(gridSize - 1.5, sy + backY * depth + sideY * side))
        };
    }

    processLiftQueue(dtSec, manager, gridSize) {
        if (!this.liftTargetId) return false;
        const lift = manager?.lifts?.find(l => l.id === this.liftTargetId);
        if (!lift) {
            this.leaveLiftQueue(manager);
            this.liftTargetId = null;
            return false;
        }

        const start = lift.startTile || lift.start;
        const end = lift.endTile || lift.end;
        if (!start || !end) return false;

        if (!lift.guestQueue) lift.guestQueue = [];
        lift.guestQueue = lift.guestQueue.filter(g => g && !g.shouldRemove && g.hasLiftPass && g.liftTargetId === lift.id);

        if (this.liftQueueLiftId !== lift.id) {
            this.leaveLiftQueue(manager);
            this.liftQueueLiftId = lift.id;
            if (!lift.guestQueue.some(g => g.id === this.id)) {
                lift.guestQueue.push(this);
            }
            this.liftQueueWaitSec = 0;
        } else if (!lift.guestQueue.some(g => g.id === this.id)) {
            lift.guestQueue.push(this);
        }

        const idx = lift.guestQueue.findIndex(g => g.id === this.id);
        if (idx < 0) return false;
        const prevIdx = this.liftQueueIndex;
        this.liftQueueIndex = idx;

        const queueTarget = this.getLiftQueueTarget(start, end, idx, gridSize);
        if (!this.targetPos || prevIdx !== idx) {
            this.setTarget(manager, gridSize, queueTarget);
        } else {
            // keep them aligned with queue drift
            const dx = this.targetPos.x - queueTarget.x;
            const dy = this.targetPos.y - queueTarget.y;
            if ((dx * dx + dy * dy) > 0.02) {
                this.setTarget(manager, gridSize, queueTarget);
            }
        }

        if (idx > 0) {
            this.nextAction = 'Wartet am Lift';
            this.liftQueueWaitSec += dtSec;
            const penaltyPerSec = 0.002 + Math.max(0, this.liftQueueWaitSec - 20) * 0.00008;
            this.satisfaction = Math.max(0, this.satisfaction - penaltyPerSec * dtSec);
            return false;
        }

        this.nextAction = 'Steigt in Lift ein';
        const boarded = this.tryBoardLift(manager, gridSize, { requireQueueFront: true });
        if (boarded) {
            this.leaveLiftQueue(manager);
            return true;
        }

        this.liftQueueWaitSec += dtSec;
        const frontPenalty = 0.0015 + Math.max(0, this.liftQueueWaitSec - 25) * 0.00006;
        this.satisfaction = Math.max(0, this.satisfaction - frontPenalty * dtSec);
        return false;
    }

    tryBoardLift(manager, gridSize, options = {}) {
        if (!this.liftTargetId) return false;
        const lift = manager.lifts.find(l => l.id === this.liftTargetId);
        if (!lift) {
            this.liftTargetId = null;
            return false;
        }

        const start = lift.startTile || lift.start;
        const end = lift.endTile || lift.end;
        if (!start || !end) return false;

        if (options.requireQueueFront && lift.guestQueue && lift.guestQueue.length > 0) {
            if (lift.guestQueue[0]?.id !== this.id) return false;
        }

        const dx = (this.x - (start.x + 0.5));
        const dy = (this.y - (start.y + 0.5));
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1.6) {
            this.setTarget(manager, gridSize, { x: start.x + 0.5, y: start.y + 0.5 });
            this.nextAction = 'Zum Lift-Einstieg';
            return false;
        }

        const nowSec = manager.currentTime || 0;
        if ((lift.nextGuestBoardTime || 0) > nowSec) {
            this.nextAction = 'Wartet am Lift';
            return false;
        }

        // Keep guest ride time aligned with visual carrier cycle in WorldCanvas:
        // keep it game-playable while still believable.
        const liftSpeed = Math.max(1, (lift.type?.speed || 3) * (lift.speedMultiplier || 1));
        const len = Math.sqrt(
            ((end.x || 0) - (start.x || 0)) ** 2 +
            ((end.y || 0) - (start.y || 0)) ** 2 +
            ((end.z || 0) - (start.z || 0)) ** 2
        );
        this.rideDurationSec = Math.max(8, Math.min(32, len / (liftSpeed * 0.9)));

        const vehiclesPerDirection = this.getLiftUphillSlotCount(lift, start, end);
        const perCarrierCap = this.getPerCarrierGuestCapacity(lift);
        const occupancyBySlot = new Map();
        (
            (manager.guests || [])
                .filter(g => g !== this && g.state === 'RIDING_LIFT' && g.rideLiftId === lift.id && g.rideCarrierSlot >= 0)
                .forEach(g => {
                    const slot = g.rideCarrierSlot % vehiclesPerDirection;
                    occupancyBySlot.set(slot, (occupancyBySlot.get(slot) || 0) + 1);
                })
        );
        let assigned = -1;
        let minOcc = Infinity;
        for (let i = 0; i < vehiclesPerDirection; i++) {
            const occ = occupancyBySlot.get(i) || 0;
            if (occ < perCarrierCap && occ < minOcc) {
                minOcc = occ;
                assigned = i;
            }
        }
        if (assigned < 0) {
            this.nextAction = 'Wartet auf freien Liftplatz';
            return false;
        }

        this.rideCarrierSlot = assigned;
        if (manager?.recordLiftBoarding) {
            manager.recordLiftBoarding(lift.id, this.liftQueueWaitSec || 0);
        }
        const baseInterval = this.getLiftBoardIntervalSec(lift);
        const queueLength = lift?.guestQueue?.length || 0;
        const slotCapacity = Math.max(1, vehiclesPerDirection * perCarrierCap);
        const pressure = Math.max(1, queueLength / slotCapacity);
        const pressureBoost = 1 + Math.min(4, pressure * 1.4);
        lift.nextGuestBoardTime = nowSec + (baseInterval / pressureBoost);
        this.rideLiftId = lift.id;
        this.rideProgress = 0;
        this.state = 'RIDING_LIFT';
        this.nextAction = 'Fährt mit Lift';
        this.path = [];
        this.targetPos = null;
        this.blocked = false;
        return true;
    }

    updateLiftRide(dtSec, manager, gridSize) {
        const lift = manager.lifts.find(l => l.id === this.rideLiftId);
        if (!lift) {
            this.state = 'WAITING';
            this.rideLiftId = null;
            this.liftTargetId = null;
            this.syncToTerrain(manager, gridSize);
            return;
        }

        const start = lift.startTile || lift.start;
        const end = lift.endTile || lift.end;
        if (!start || !end || this.rideDurationSec <= 0) {
            this.state = 'WAITING';
            this.rideLiftId = null;
            this.liftTargetId = null;
            this.syncToTerrain(manager, gridSize);
            return;
        }

        this.rideProgress = Math.min(1, this.rideProgress + (dtSec / this.rideDurationSec));

        // TALFAHRT: bei rideReverse fährt der Gast die Liftlinie ABWÄRTS
        const rideFrom = this.rideReverse ? end : start;
        const rideTo = this.rideReverse ? start : end;

        if (this.rideProgress < 1) {
            // Keep guest synced with lift line for drop-off and optional rendering use.
            this.x = (rideFrom.x + 0.5) + ((rideTo.x + 0.5) - (rideFrom.x + 0.5)) * this.rideProgress;
            this.y = (rideFrom.y + 0.5) + ((rideTo.y + 0.5) - (rideFrom.y + 0.5)) * this.rideProgress;
            this.z = (rideFrom.z || 0) + ((rideTo.z || 0) - (rideFrom.z || 0)) * this.rideProgress;
            return;
        }

        // TALFAHRT abgeschlossen: unten angekommen, normal weiterlaufen
        if (this.rideReverse) {
            this.rideReverse = false;
            this.x = Math.max(0.5, Math.min(gridSize - 1.5, start.x + 0.5));
            this.y = Math.max(0.5, Math.min(gridSize - 1.5, start.y + 0.5));
            this.syncToTerrain(manager, gridSize);
            this.rideLiftId = null;
            this.liftTargetId = null;
            this.rideCarrierSlot = -1;
            this.rideProgress = 0;
            this.rideDurationSec = 0;
            this.state = 'WALKING';
            this.nextAction = 'Im Tal angekommen';
            this.liftRideCooldownSec = 6;
            this.decideNextNeedTarget(manager, gridSize);
            return;
        }

        // Arrive exactly at mountain station center and continue from there.
        const stationX = Math.max(0.5, Math.min(gridSize - 1.5, end.x + 0.5));
        const stationY = Math.max(0.5, Math.min(gridSize - 1.5, end.y + 0.5));
        this.x = stationX;
        this.y = stationY;
        this.syncToTerrain(manager, gridSize);
        const route = this.findNearestPisteRoute(manager, end);

        const lastRideDuration = this.rideDurationSec; // für evtl. Talfahrt merken
        this.rideLiftId = null;
        this.liftTargetId = null;
        this.rideCarrierSlot = -1;
        this.rideProgress = 0;
        this.rideDurationSec = 0;
        this.riddenLiftIds.add(lift.id);
        this.hasSkis = false;
        this.state = 'WALKING';
        this.postRideStep = route ? 'TO_PISTE_START' : null;
        this.postRideEndPoint = route?.bottom || null;
        this.postRideRoute = route || null;
        this.activePisteId = route?.pisteId || null;
        this.nextAction = route ? 'Zur nächsten Piste' : 'Bergstation';

        // If another lift is directly nearby at mountain station, allow chaining lifts.
        const nearbyUnseenLift = this.pickLiftCandidate(manager, { x: end.x, y: end.y }, {
            excludeLiftId: lift.id,
            maxDistance: 40,
            preferUnseen: true,
            preferHigherElevation: true,
            originZ: end.z || 0,
            maxUphillClimb: 60
        });
        const nearbyAnyLift = this.pickLiftCandidate(manager, { x: end.x, y: end.y }, {
            excludeLiftId: lift.id,
            maxDistance: 30,
            preferUnseen: false,
            preferHigherElevation: true,
            originZ: end.z || 0,
            maxUphillClimb: 45
        });
        const nearbyLift = nearbyUnseenLift || nearbyAnyLift;
        const routePiste = route?.pisteId ? manager.pistes.find(p => p.id === route.pisteId) : null;
        const routeFit = this.getPisteDifficultyFit(this.getPisteDifficulty(routePiste));
        const shouldChainLift = nearbyLift && (
            !route ||
            (nearbyUnseenLift ? Math.random() < Math.max(0.8, 0.92 + this.exploreLiftBias * 0.04 - routeFit * 0.08) : Math.random() < Math.max(0.56, 0.74 - routeFit * 0.08))
        );
        if (shouldChainLift) {
            this.postRideStep = null;
            this.postRideEndPoint = null;
            this.postRideRoute = null;
            this.activePisteId = null;
            this.nextAction = 'Nächsten Lift nehmen';
            this.seekNearestLift(manager, gridSize, {
                originPoint: { x: stationX, y: stationY },
                excludeLiftId: lift.id,
                maxDistance: nearbyUnseenLift ? 40 : 30,
                preferUnseen: !!nearbyUnseenLift,
                preferHigherElevation: true,
                originZ: end.z || 0,
                maxUphillClimb: nearbyUnseenLift ? 60 : 45
            });
            this.liftRideCooldownSec = 0;
            return;
        }

        if (route?.entry) {
            // Ensure path starts exactly at station, not from an old interpolation residue.
            this.x = stationX;
            this.y = stationY;
            this.syncToTerrain(manager, gridSize);
            this.setTarget(manager, gridSize, route.entry);
        } else {
            // TALFAHRT: keine Piste und kein Anschluss-Lift erreichbar →
            // mit demselben Lift wieder hinunterfahren, statt zu Fuß quer
            // durch die Landschaft zu laufen.
            this.rideLiftId = lift.id;
            this.rideReverse = true;
            this.rideProgress = 0;
            this.rideDurationSec = Math.max(6, lastRideDuration || 10);
            this.state = 'RIDING_LIFT';
            this.nextAction = 'Talfahrt mit dem Lift';
            return;
        }
        this.liftRideCooldownSec = route ? 0 : 12;
    }

    syncToTerrain(manager, gridSize) {
        const hm = manager?.heightmap;
        if (!hm || !gridSize) {
            this.z = 0;
            return;
        }
        const tx = Math.max(0, Math.min(gridSize - 1, Math.floor(this.x)));
        const ty = Math.max(0, Math.min(gridSize - 1, Math.floor(this.y)));
        const idx = ty * gridSize + tx;
        this.z = (hm[idx] || 0);
    }

    computeSkiSkill() {
        const prefBase = this.slopePreference === 'BLACK' ? 0.85 : (this.slopePreference === 'RED' ? 0.62 : 0.32);
        const catBonus = {
            LOW_BUDGET: -0.05,
            FAMILY: -0.12,
            MIDDLE_CLASS: 0.0,
            PREMIUM: 0.08,
            LUXURY: 0.12
        }[this.categoryKey] ?? 0;
        const skill = prefBase + catBonus + (Math.random() * 0.16 - 0.08);
        return Math.max(0.1, Math.min(0.98, skill));
    }

    getLiftUphillSlotCount(lift, start, end) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, lift?.type?.capacity || 1);
        const isCog = n.includes('cog');
        const isDrag = n.includes('t-bar') || n.includes('platter') || n.includes('carpet');
        const isChair = n.includes('chairlift');
        const isGondola = n.includes('gondola');
        const isAerial = n.includes('aerial');

        const len = Math.sqrt(
            ((end?.x || 0) - (start?.x || 0)) ** 2 +
            ((end?.y || 0) - (start?.y || 0)) ** 2 +
            ((end?.z || 0) - (start?.z || 0)) ** 2
        );

        if (isDrag) {
            return Math.max(1, Math.min(4, Math.floor(len / 18)));
        }
        if (isChair) {
            const base = Math.max(3, Math.floor(len / 10));
            const capBoost = Math.max(0, Math.ceil((cap - 2) / 1.5));
            return Math.max(3, Math.min(18, base + capBoost));
        }
        if (isGondola) {
            const base = Math.max(5, Math.floor(len / 10));
            const capBoost = Math.ceil(cap / 2);
            return Math.max(5, Math.min(34, base + capBoost));
        }
        if (isAerial || isCog) {
            const base = Math.max(6, Math.floor(len / 13));
            const capBoost = Math.ceil(cap / 8);
            return Math.max(6, Math.min(40, base + capBoost));
        }
        return Math.max(3, Math.min(12, Math.floor(len / 9)));
    }

    getPerCarrierGuestCapacity(lift) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, Math.round(lift?.type?.capacity || 1));
        if (n.includes('t-bar') || n.includes('platter') || n.includes('carpet')) return Math.min(2, cap);
        if (n.includes('chairlift')) return Math.min(8, cap);
        if (n.includes('gondola')) return Math.min(24, cap);
        if (n.includes('aerial') || n.includes('cog')) return Math.min(80, cap);
        return Math.min(6, cap);
    }

    getLiftBoardIntervalSec(lift) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, lift?.type?.capacity || 1);
        const speedMul = Math.max(0.6, Math.min(2.2, lift?.speedMultiplier || 1));
        let interval = 2.2;
        if (n.includes('t-bar') || n.includes('platter') || n.includes('carpet')) interval = 3.9;
        else if (n.includes('chairlift')) interval = Math.max(0.9, 2.1 - Math.max(0, (cap - 2) * 0.12));
        else if (n.includes('gondola')) interval = Math.max(0.3, 1.25 - Math.max(0, (cap - 8) * 0.055));
        else if (n.includes('aerial') || n.includes('cog')) interval = Math.max(0.22, 0.7 - Math.max(0, (cap - 40) * 0.006));
        return Math.max(0.15, interval / speedMul);
    }

    beginSkiRun() {
        const route = this.postRideRoute;
        if (!route?.path || route.path.length < 2) return false;

        this.skiRoute = route.path.map(p => ({ x: p.x, y: p.y, z: p.z || 0 }));
        this.skiRouteCumLen = [0];
        let total = 0;
        for (let i = 1; i < this.skiRoute.length; i++) {
            const a = this.skiRoute[i - 1];
            const b = this.skiRoute[i];
            const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
            total += Math.max(0.0001, d);
            this.skiRouteCumLen.push(total);
        }
        this.skiRouteLength = total;
        this.skiDistance = 0;
        this.state = 'SKIING';
        this.hasSkis = true;
        if (route.pisteId) this.activePisteId = route.pisteId;
        this.nextAction = 'Skifahren';
        return total > 0.01;
    }

    sampleSkiCenterAt(distance) {
        if (!this.skiRoute || this.skiRoute.length < 2 || !this.skiRouteCumLen) return null;
        const d = Math.max(0, Math.min(this.skiRouteLength, distance));

        let segIdx = 0;
        while (segIdx < this.skiRouteCumLen.length - 1 && this.skiRouteCumLen[segIdx + 1] < d) segIdx++;

        const a = this.skiRoute[segIdx];
        const b = this.skiRoute[Math.min(segIdx + 1, this.skiRoute.length - 1)];
        const d0 = this.skiRouteCumLen[segIdx];
        const d1 = this.skiRouteCumLen[Math.min(segIdx + 1, this.skiRouteCumLen.length - 1)];
        const segLen = Math.max(0.0001, d1 - d0);
        const t = Math.max(0, Math.min(1, (d - d0) / segLen));

        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
            tx: (b.x - a.x) / segLen,
            ty: (b.y - a.y) / segLen
        };
    }

    updateSkiing(dtSec, manager, gridSize) {
        if (!this.skiRoute || !this.skiRouteCumLen || this.skiRouteLength <= 0) {
            this.state = 'WAITING';
            this.nextAction = 'Lift suchen';
            this.hasSkis = false;
            return;
        }

        this.skiDistance = Math.min(this.skiRouteLength, this.skiDistance + this.skiSpeed * dtSec);
        const s = this.sampleSkiCenterAt(this.skiDistance);
        if (!s) {
            this.state = 'WAITING';
            this.nextAction = 'Lift suchen';
            this.hasSkis = false;
            return;
        }

        const nx = -s.ty;
        const ny = s.tx;
        const swing = Math.sin(this.skiOscPhase + this.skiDistance * this.skiTurnFrequency * 2.4) * this.skiTurnAmplitude;
        this.skiLean = Math.max(-1, Math.min(1, swing / Math.max(0.001, this.skiTurnAmplitude)));

        this.x = Math.max(0.1, Math.min(gridSize - 1.1, s.x + nx * swing));
        this.y = Math.max(0.1, Math.min(gridSize - 1.1, s.y + ny * swing));
        this.walkPhase += dtSec * (10 + this.skiSpeed * 3);
        this.syncToTerrain(manager, gridSize);
        this.nextAction = 'Skifahren';

        // While skiing, frequently probe for branch pistes to improve distribution.
        this.branchCheckTimer = (this.branchCheckTimer || 0) + dtSec;
        const progress = this.skiRouteLength > 0 ? (this.skiDistance / this.skiRouteLength) : 0;
        if (progress > 0.06 && progress < 0.95 && this.branchCheckTimer >= 0.42) {
            this.branchCheckTimer = 0;
            const branchRoute = this.findConnectedDownhillRoute(
                manager,
                { x: this.x, y: this.y, z: this.z },
                this.activePisteId,
                {
                    maxEntryDist: 18,
                    allowUphillDelta: 18,
                    forwardDir: { x: s.tx, y: s.ty },
                    minForwardDot: -0.02
                }
            );
            const branchIsNew = branchRoute?.pisteId && !this.riddenPisteIds.has(branchRoute.pisteId);
            const branchChance = branchIsNew
                ? Math.min(0.94, 0.42 + this.branchCuriosity * 0.42 + this.explorePisteBias * 0.1)
                : Math.min(0.5, 0.12 + this.branchCuriosity * 0.24);
            if (branchRoute?.path?.length >= 2 && Math.random() < branchChance) {
                const newPath = [{ x: this.x, y: this.y, z: this.z }, ...branchRoute.path];
                this.skiRoute = newPath;
                this.skiRouteCumLen = [0];
                let total = 0;
                for (let i = 1; i < this.skiRoute.length; i++) {
                    const a = this.skiRoute[i - 1];
                    const b = this.skiRoute[i];
                    const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                    total += Math.max(0.0001, d);
                    this.skiRouteCumLen.push(total);
                }
                this.skiRouteLength = total;
                this.skiDistance = 0;
                this.activePisteId = branchRoute.pisteId || this.activePisteId;
                this.nextAction = 'Abzweigung genommen';
            }
        }

        if (this.skiDistance >= this.skiRouteLength - 0.02) {
            const last = this.skiRoute[this.skiRoute.length - 1];
            this.x = last.x;
            this.y = last.y;
            this.syncToTerrain(manager, gridSize);
            const completedPisteId = this.activePisteId;
            const completedWasNew = completedPisteId && !this.riddenPisteIds.has(completedPisteId);

            this.state = 'WAITING';
            this.nextAction = 'Abfahrt beendet';
            this.hasSkis = false;
            this.skiLean = 0;
            if (completedPisteId) this.riddenPisteIds.add(completedPisteId);

            const connectedRoute = this.findConnectedDownhillRoute(manager, { x: this.x, y: this.y, z: this.z }, completedPisteId);
            const nearbyLift = this.pickLiftCandidate(manager, { x: this.x, y: this.y }, {
                preferUnseen: true,
                preferHigherElevation: true,
                originZ: this.z || 0,
                maxUphillClimb: 20,
                maxDistance: 26
            });

            this.postRideStep = null;
            this.postRideEndPoint = null;
            this.postRideRoute = null;
            this.skiRoute = null;
            this.skiRouteCumLen = null;
            this.skiRouteLength = 0;
            this.skiDistance = 0;

            const shouldSeekServiceNow = this.bladder >= 58 || this.hunger >= 40 || this.thirst >= 36;
            if (shouldSeekServiceNow) {
                this.needTargetType = null;
                this.needTargetBuildingId = null;
                this.decideNextNeedTarget(manager, gridSize);
                if (this.needTargetType || this.postRideStep || this.state === 'WALKING') {
                    this.activePisteId = null;
                    this.preferNextLift = false;
                    this.liftRideCooldownSec = 0;
                    return;
                }
            }

            const connectedIsNew = connectedRoute?.pisteId && !this.riddenPisteIds.has(connectedRoute.pisteId);
            const liftPreference = connectedRoute?.entry
                ? (0.46 + this.flowPreference * 0.18 - (connectedIsNew ? this.branchCuriosity * 0.24 : 0))
                : 0.94;
            const preferLiftNow = !!nearbyLift && (Math.random() < Math.max(0.2, Math.min(0.96, liftPreference)));
            if (preferLiftNow) {
                this.activePisteId = null;
                this.preferNextLift = true;
                this.liftRideCooldownSec = 0;
                this.seekNearestLift(manager, gridSize, {
                    preferUnseen: true,
                    preferHigherElevation: true,
                    originZ: this.z || 0,
                    maxUphillClimb: 20,
                    maxDistance: 26
                });
            } else if (connectedRoute?.entry) {
                this.state = 'WALKING';
                this.postRideStep = 'TO_PISTE_START';
                this.postRideRoute = connectedRoute;
                this.postRideEndPoint = connectedRoute.bottom;
                this.activePisteId = connectedRoute.pisteId || null;
                this.nextAction = 'Nächste Piste';
                this.setTarget(manager, gridSize, connectedRoute.entry);
                this.preferNextLift = false;
                this.liftRideCooldownSec = 0;
            } else {
                this.activePisteId = null;
                this.preferNextLift = true;
                if (this.seekNearestLift(manager, gridSize, {
                    preferUnseen: true,
                    preferHigherElevation: true,
                    originZ: this.z || 0,
                    maxUphillClimb: 12,
                    maxDistance: 80
                })) {
                    this.liftRideCooldownSec = 0;
                } else {
                    this.liftRideCooldownSec = Math.max(this.liftRideCooldownSec, 1.5);
                }
            }

            const finishedPiste = manager.pistes.find(p => p.id === completedPisteId);
            const finishedDiff = this.getPisteDifficulty(finishedPiste);
            const fit = this.getPisteDifficultyFit(finishedDiff);
            const satisfactionGain = (completedWasNew ? (2.4 + this.noveltyJoy * 1.8) : 0.8) + fit * (completedWasNew ? 4.2 : 1.7);
            this.satisfaction = Math.min(100, this.satisfaction + satisfactionGain);
        }
    }

    findNearestPisteRoute(manager, fromPoint) {
        if (!manager?.pistes?.length || !fromPoint) return null;
        const totalPistes = manager.pistes.filter(p => p?.segments?.length).length;
        const hasUnseen = manager.pistes.some(p => p?.segments?.length && !this.riddenPisteIds.has(p.id));
        const candidates = [];

        for (const piste of manager.pistes) {
            if (!piste?.segments?.length) continue;
            let minZ = Infinity;
            let maxZ = -Infinity;
            let bottom = piste.segments[0];
            for (const seg of piste.segments) {
                if (!seg) continue;
                const z = seg.z ?? 0;
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
                if ((seg.z || 0) < (bottom.z || 0)) bottom = seg;
            }
            if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) continue;

            const upperBandFloor = minZ + (maxZ - minZ) * 0.45;
            const entryCandidates = piste.segments.filter(seg => seg && (seg.z || 0) >= upperBandFloor);
            const scan = entryCandidates.length ? entryCandidates : piste.segments;

            let bestEntry = null;
            let bestEntryDist = Infinity;
            for (const seg of scan) {
                if (!seg) continue;
                const d = Math.abs(fromPoint.x - seg.x) + Math.abs(fromPoint.y - seg.y);
                if (d < bestEntryDist) {
                    bestEntryDist = d;
                    bestEntry = seg;
                }
            }
            if (!bestEntry) continue;

            const seen = this.riddenPisteIds.has(piste.id);
            const pisteDifficulty = this.getPisteDifficulty(piste);
            const fit = this.getPisteDifficultyFit(pisteDifficulty);
            const entryPoint = { x: bestEntry.x + 0.5, y: bestEntry.y + 0.5 };
            const crowdPenalty = this.getPisteCrowding(manager, piste.id, entryPoint) * (1.15 + this.areaWanderlust * 0.3);
            const explorationPenalty = seen ? (hasUnseen ? (34 + this.explorePisteBias * 12) : (10 + this.repeatTolerance * 5.5)) : -(4 + this.explorePisteBias * 3.1);
            const coverageBoost = !seen && totalPistes > 1 ? -(2.2 + this.exploreFarBias * 1.4 + this.areaWanderlust * 0.7) : 0;
            const depthGain = Math.max(0, (fromPoint.z || maxZ) - (bottom.z || minZ));
            const depthBonus = -Math.min(90, depthGain) * 0.075 * this.exploreFarBias;
            const fitBonus = fit * (8 + this.explorePisteBias * 4.4 + this.noveltyJoy);
            const randomJitter = (Math.random() - 0.5) * (4.4 + this.branchCuriosity);
            const score = bestEntryDist + explorationPenalty + coverageBoost + depthBonus + crowdPenalty - fitBonus + randomJitter;
            const route = this.buildRouteForPiste(piste, bestEntry, bottom);
            if (!route) continue;
            candidates.push({ piste, entry: bestEntry, route, score, seen, entryDist: bestEntryDist, fit, crowdPenalty });
        }

        if (!candidates.length) {
            // Fallback: nearest segment on any piste.
            let fallback = null;
            let fd = Infinity;
            for (const piste of manager.pistes) {
                if (!piste?.segments?.length) continue;
                for (const seg of piste.segments) {
                    if (!seg) continue;
                    const d = Math.abs(fromPoint.x - seg.x) + Math.abs(fromPoint.y - seg.y);
                    if (d < fd) {
                        fd = d;
                        fallback = seg;
                    }
                }
            }
            if (!fallback) return null;
            return {
                entry: { x: fallback.x + 0.5, y: fallback.y + 0.5 },
                bottom: { x: fallback.x + 0.5, y: fallback.y + 0.5 },
                path: [
                    { x: fallback.x + 0.5, y: fallback.y + 0.5, z: fallback.z || 0 },
                    { x: fallback.x + 0.5, y: fallback.y + 0.5, z: fallback.z || 0 }
                ]
            };
        }

        candidates.sort((a, b) => a.score - b.score);
        const bestScore = candidates[0].score;
        const pool = candidates.filter(c => c.score <= bestScore + 18);
        const unseenPool = pool.filter(c => !c.seen);
        const selectionPool = unseenPool.length ? unseenPool : pool;
        let pick = selectionPool[0];
        if (selectionPool.length > 1) {
            let weightSum = 0;
            const weighted = selectionPool.map(c => {
                const proximity = 1 / (1 + Math.max(0, c.score - bestScore) * 0.42);
                const unseenBoost = c.seen ? (0.6 + this.repeatTolerance * 0.16) : (2.1 + this.explorePisteBias * 0.82);
                const branchBoost = c.entryDist <= 10 ? (1.38 + this.branchCuriosity * 0.26) : 1.04;
                const fitBoost = 0.7 + c.fit * 1.2;
                const crowdBoost = 1 / (1 + Math.max(0, c.crowdPenalty) * 0.12);
                const w = proximity * unseenBoost * branchBoost * fitBoost * crowdBoost;
                weightSum += w;
                return { c, w };
            });
            let roll = Math.random() * weightSum;
            for (const item of weighted) {
                roll -= item.w;
                if (roll <= 0) {
                    pick = item.c;
                    break;
                }
            }
        }

        return pick.route;
    }

    buildRouteForPiste(piste, entrySeg, bottomSeg = null) {
        if (!piste?.segments?.length || !entrySeg) return null;
        let bottom = bottomSeg || piste.segments[0];
        for (const seg of piste.segments) {
            if (seg && (seg.z || 0) < (bottom.z || 0)) bottom = seg;
        }

        const segments = piste.segments || [];
        let entryIdx = segments.indexOf(entrySeg);
        let bottomIdx = segments.indexOf(bottom);
        if (entryIdx < 0) entryIdx = 0;
        if (bottomIdx < 0) bottomIdx = segments.length - 1;
        const step = entryIdx <= bottomIdx ? 1 : -1;
        const path = [];
        for (let i = entryIdx; ; i += step) {
            const seg = segments[i];
            if (seg) path.push({ x: seg.x + 0.5, y: seg.y + 0.5, z: seg.z || 0 });
            if (i === bottomIdx) break;
            if (i + step < 0 || i + step >= segments.length) break;
        }
        if (path.length < 2) {
            path.push({ x: bottom.x + 0.5, y: bottom.y + 0.5, z: bottom.z || 0 });
        }

        return {
            pisteId: piste.id,
            entry: { x: entrySeg.x + 0.5, y: entrySeg.y + 0.5 },
            bottom: { x: bottom.x + 0.5, y: bottom.y + 0.5 },
            path
        };
    }

    findConnectedDownhillRoute(manager, fromPoint, excludePisteId = null, options = {}) {
        if (!manager?.pistes?.length || !fromPoint) return null;
        const maxEntryDist = options.maxEntryDist ?? 34;
        const allowUphillDelta = options.allowUphillDelta ?? 14;
        const forwardDir = options.forwardDir || null;
        const minForwardDot = options.minForwardDot ?? -0.1;
        const targetPoint = options.targetPoint || null;
        const hasUnseen = manager.pistes.some(p =>
            p?.segments?.length &&
            (!excludePisteId || p.id !== excludePisteId) &&
            !this.riddenPisteIds.has(p.id)
        );
        const candidates = [];

        for (const piste of manager.pistes) {
            if (!piste?.segments?.length) continue;
            if (excludePisteId && piste.id === excludePisteId) continue;

            let minZ = Infinity;
            let maxZ = -Infinity;
            let bottom = piste.segments[0];
            for (const seg of piste.segments) {
                if (!seg) continue;
                const z = seg.z || 0;
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
                if ((seg.z || 0) < (bottom.z || 0)) bottom = seg;
            }
            if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) continue;
            if ((bottom.z || 0) >= (fromPoint.z || maxZ) - 0.7) continue; // must continue further down

            const entryFloor = minZ + (maxZ - minZ) * 0.18;
            let bestEntry = null;
            let bestEntryDist = Infinity;
            let bestHeightPenalty = 0;
            for (const seg of piste.segments) {
                if (!seg) continue;
                if ((seg.z || 0) < entryFloor) continue;
                const d = Math.abs(fromPoint.x - seg.x) + Math.abs(fromPoint.y - seg.y);
                if (d > maxEntryDist) continue; // allow loose, non-perfectly docked branching
                const zDelta = (seg.z || 0) - (fromPoint.z || 0);
                const heightPenalty = zDelta > allowUphillDelta ? (zDelta - allowUphillDelta) * 0.2 : 0;
                let forwardPenalty = 0;
                if (forwardDir) {
                    const vx = seg.x - fromPoint.x;
                    const vy = seg.y - fromPoint.y;
                    const vLen = Math.sqrt(vx * vx + vy * vy) || 1;
                    const forwardDot = ((vx / vLen) * forwardDir.x) + ((vy / vLen) * forwardDir.y);
                    if (forwardDot < minForwardDot) continue;
                    if (forwardDot < 0.18) {
                        forwardPenalty = (0.18 - forwardDot) * 8;
                    }
                }
                const candidateScore = d + heightPenalty + forwardPenalty;
                if (candidateScore < bestEntryDist) {
                    bestEntryDist = candidateScore;
                    bestEntry = seg;
                    bestHeightPenalty = heightPenalty;
                }
            }
            if (!bestEntry) continue;

            const seen = this.riddenPisteIds.has(piste.id);
            const pisteDifficulty = this.getPisteDifficulty(piste);
            const fit = this.getPisteDifficultyFit(pisteDifficulty);
            const entryPoint = { x: bestEntry.x + 0.5, y: bestEntry.y + 0.5 };
            const crowdPenalty = this.getPisteCrowding(manager, piste.id, entryPoint) * (1.1 + this.areaWanderlust * 0.32);
            const seenPenalty = seen ? (hasUnseen ? (30 + this.explorePisteBias * 10) : (7 + this.repeatTolerance * 4.2)) : -(3 + this.explorePisteBias * 3.2);
            const branchBoost = bestEntryDist <= 8 ? (2.2 + this.branchCuriosity * 0.55) : 0;
            const depthGain = Math.max(0, (fromPoint.z || maxZ) - (bottom.z || minZ));
            const depthBonus = -Math.min(90, depthGain) * 0.07 * this.exploreFarBias * (0.95 + this.areaWanderlust * 0.22);
            const fitBonus = fit * (6.8 + this.explorePisteBias * 4.3 + this.noveltyJoy * 0.9);
            const targetBonus = targetPoint
                ? -Math.min(
                    34,
                    (Math.abs((fromPoint.x || 0) - targetPoint.x) + Math.abs((fromPoint.y || 0) - targetPoint.y)) -
                    (Math.abs((bottom.x || 0) - targetPoint.x) + Math.abs((bottom.y || 0) - targetPoint.y))
                ) * 0.22
                : 0;
            const randomJitter = (Math.random() - 0.5) * (3.2 + this.branchCuriosity);
            const score = bestEntryDist + seenPenalty + bestHeightPenalty - branchBoost + depthBonus + targetBonus + crowdPenalty - fitBonus + randomJitter;
            const route = this.buildRouteForPiste(piste, bestEntry, bottom);
            if (route) {
                if (forwardDir && route.path.length >= 2) {
                    const approachDx = route.path[0].x - fromPoint.x;
                    const approachDy = route.path[0].y - fromPoint.y;
                    const approachLen = Math.sqrt(approachDx * approachDx + approachDy * approachDy) || 1;
                    const approachDot = ((approachDx / approachLen) * forwardDir.x) + ((approachDy / approachLen) * forwardDir.y);

                    const contDx = route.path[1].x - route.path[0].x;
                    const contDy = route.path[1].y - route.path[0].y;
                    const contLen = Math.sqrt(contDx * contDx + contDy * contDy) || 1;
                    const contDot = ((contDx / contLen) * forwardDir.x) + ((contDy / contLen) * forwardDir.y);
                    const entryDist = Math.sqrt((route.path[0].x - fromPoint.x) ** 2 + (route.path[0].y - fromPoint.y) ** 2);
                    const nextDist = Math.sqrt((route.path[1].x - fromPoint.x) ** 2 + (route.path[1].y - fromPoint.y) ** 2);

                    if (approachDot < minForwardDot || contDot < -0.2 || nextDist + 0.2 < entryDist) {
                        continue;
                    }
                }
                candidates.push({
                    route,
                    score,
                    seen,
                    entryDist: bestEntryDist,
                    fit,
                    crowdPenalty
                });
            }
        }

        if (!candidates.length) return null;

        candidates.sort((a, b) => a.score - b.score);
        const bestScore = candidates[0].score;
        const pool = candidates.filter(c => c.score <= bestScore + 18);
        const unseenPool = pool.filter(c => !c.seen);
        const selectionPool = unseenPool.length ? unseenPool : pool;
        if (selectionPool.length === 1) return selectionPool[0].route;

        let weightSum = 0;
        const weighted = selectionPool.map(c => {
            const proximity = 1 / (1 + Math.max(0, c.score - bestScore) * 0.45);
            const unseenBoost = c.seen ? (0.64 + this.repeatTolerance * 0.18) : (2.05 + this.explorePisteBias * 0.82);
            const branchBoost = c.entryDist <= 12 ? (1.45 + this.branchCuriosity * 0.34) : 1.02;
            const fitBoost = 0.72 + c.fit * 1.25;
            const crowdBoost = 1 / (1 + Math.max(0, c.crowdPenalty) * 0.12);
            const w = proximity * unseenBoost * branchBoost * fitBoost * crowdBoost;
            weightSum += w;
            return { c, w };
        });

        let roll = Math.random() * weightSum;
        for (const item of weighted) {
            roll -= item.w;
            if (roll <= 0) return item.c.route;
        }

        return weighted[0].c.route;
    }

    findNearestBuilding(manager, predicate) {
        let best = null;
        let bestDist = Infinity;
        for (const b of manager.buildings) {
            if (!predicate(b)) continue;
            const { w, h } = manager.getBuildingFootprint(b);
            const bx = b.x + w / 2;
            const by = b.y + h / 2;
            const d = Math.abs(this.x - bx) + Math.abs(this.y - by);
            if (d < bestDist) {
                bestDist = d;
                best = b;
            }
        }
        return best;
    }

    findBestNeedBuilding(manager, predicate, options = {}) {
        let best = null;
        let bestScore = Infinity;
        for (const b of manager.buildings) {
            if (!predicate(b)) continue;
            const { w, h } = manager.getBuildingFootprint(b);
            const bx = b.x + w / 2;
            const by = b.y + h / 2;
            const dist = Math.abs(this.x - bx) + Math.abs(this.y - by);
            if (options.maxDistance && dist > options.maxDistance) continue;
            const capacity = Math.max(1, b.type?.capacity || 1);
            const occupancy = Math.max(0, b.currentOccupancy || 0);
            const occupancyRatio = occupancy / capacity;
            const occupancyPenalty = occupancyRatio * (options.occupancyWeight ?? 10);
            const pricePenalty = options.includePrice ? manager.getBuildingCurrentPrice(b) * (options.priceWeight ?? 0.02) : 0;
            const buildingZ = manager.getTileHeight ? manager.getTileHeight(Math.floor(bx), Math.floor(by)) : 0;
            const climbPenalty = Math.max(0, buildingZ - (this.z || 0) - (options.maxUphillDelta ?? 4)) * (options.climbWeight ?? 0.9);
            const score = dist + occupancyPenalty + pricePenalty + climbPenalty;
            if (score < bestScore) {
                bestScore = score;
                best = b;
            }
        }
        return best;
    }

    beginLinkedPisteRoute(manager, gridSize, route, nextAction = 'Zur Piste') {
        if (!route?.entry) return false;
        this.leaveLiftQueue(manager);
        this.state = 'WALKING';
        this.postRideStep = 'TO_PISTE_START';
        this.postRideRoute = route;
        this.postRideEndPoint = route.bottom || null;
        this.activePisteId = route.pisteId || null;
        this.nextAction = nextAction;
        this.setTarget(manager, gridSize, route.entry);
        return true;
    }

    tryTravelTowardBuildingViaNetwork(manager, gridSize, building, options = {}) {
        if (!building) return false;
        const targetPoint = this.getBuildingAccessSpot(building, manager);
        const currentDist = Math.abs((this.x || 0) - targetPoint.x) + Math.abs((this.y || 0) - targetPoint.y);
        const targetZ = manager.getTileHeight ? manager.getTileHeight(Math.floor(targetPoint.x), Math.floor(targetPoint.y)) : 0;
        const heightDelta = (this.z || 0) - targetZ;

        if (currentDist <= (options.directWalkDistance ?? 18)) return false;
        if (heightDelta <= (options.minDownhillDelta ?? 6) && currentDist <= 30) return false;

        const route = this.findConnectedDownhillRoute(
            manager,
            { x: this.x, y: this.y, z: this.z },
            this.activePisteId,
            {
                maxEntryDist: options.maxEntryDist ?? 22,
                allowUphillDelta: options.allowUphillDelta ?? 10,
                targetPoint
            }
        );
        if (!route?.entry || !route?.bottom) return false;

        const routeDist = Math.abs(route.bottom.x - targetPoint.x) + Math.abs(route.bottom.y - targetPoint.y);
        if (routeDist >= currentDist - 4) return false;

        return this.beginLinkedPisteRoute(manager, gridSize, route, options.actionLabel || 'Zur Zielpiste');
    }

    getBuildingAccessSpot(building, manager) {
        const { w, h } = manager.getBuildingFootprint(building);
        // Prefer an outside edge near the building "front", fallback center.
        return {
            x: building.x + Math.max(0.6, Math.min(w - 0.6, w * 0.55)),
            y: building.y + Math.max(0.6, Math.min(h - 0.6, h * 0.85))
        };
    }

    fulfillNeedAtTarget(manager, gridSize) {
        const targetBuilding = manager.buildings.find(b => b.id === this.needTargetBuildingId);
        if (!targetBuilding) {
            this.needTargetType = null;
            this.needTargetBuildingId = null;
            this.state = 'WAITING';
            return;
        }

        if (this.needTargetType === 'TOILET') {
            this.serviceType = 'TOILET';
            this.serviceBuildingId = targetBuilding.id;
            this.serviceRemainingSec = 10 + Math.random() * 10;
            this.state = 'IN_SERVICE';
            this.nextAction = 'Toilette benutzen';
            this.targetPos = null;
            this.path = [];
            this.blocked = false;
            this.syncToTerrain(manager, gridSize);
            return;
        } else if (this.needTargetType === 'FOOD') {
            this.serviceType = 'FOOD';
            this.serviceBuildingId = targetBuilding.id;
            this.serviceRemainingSec = 55 + Math.random() * 15; // ~1 min
            this.state = 'IN_SERVICE';
            this.nextAction = 'In Gastronomie';
            this.targetPos = null;
            this.path = [];
            this.blocked = false;
            this.syncToTerrain(manager, gridSize);
            return;
        } else if (this.needTargetType === 'HOTEL') {
            this.serviceType = 'HOTEL';
            this.serviceBuildingId = targetBuilding.id;
            this.serviceRemainingSec = 14 * 60 + Math.random() * 120; // ~15 minutes
            this.state = 'IN_SERVICE';
            this.nextAction = 'Im Hotel (Abend)';
            this.targetPos = null;
            this.path = [];
            this.blocked = false;
            this.lastHotelVisitDay = manager.getCurrentDayNumber ? manager.getCurrentDayNumber() : this.lastHotelVisitDay;
            this.syncToTerrain(manager, gridSize);
            return;
        }

        this.needTargetType = null;
        this.needTargetBuildingId = null;
        this.state = 'WAITING';
    }

    updateServiceVisit(dtSec, manager, gridSize) {
        this.serviceRemainingSec -= dtSec;
        if (this.serviceRemainingSec > 0) {
            this.nextAction = this.serviceType === 'FOOD'
                ? 'Isst/Trinkt'
                : this.serviceType === 'HOTEL'
                    ? 'Ruht im Hotel'
                    : 'Toilette';
            this.syncToTerrain(manager, gridSize);
            return;
        }

        const targetBuilding = manager.buildings.find(b => b.id === this.serviceBuildingId);
        if (this.serviceType === 'TOILET') {
            this.bladder = 8 + Math.random() * 10;
            this.unmetBladderSec = 0;
            this.nextAction = 'Erleichtert';
        } else if (this.serviceType === 'FOOD') {
            const basePrice = manager.getBuildingCurrentPrice(targetBuilding);
            const mealCost = Math.max(8, Math.round(basePrice * (0.55 + Math.random() * 0.65)));
            const drinkCost = Math.max(3, Math.round(basePrice * (0.18 + Math.random() * 0.35)));
            const totalCost = mealCost + drinkCost;

            if (this.money >= totalCost) {
                this.money -= totalCost;
                manager.earn(totalCost, 'gastro');
                this.hunger = Math.max(5, this.hunger - 78);
                this.thirst = Math.max(4, this.thirst - 82);
                this.unmetHungerSec = 0;
                this.unmetThirstSec = 0;
                this.nextAction = 'Gastro besucht';
                this.completeWishForBuilding(targetBuilding);
            } else {
                const partial = Math.max(0, Math.min(this.money, Math.round(totalCost * 0.45)));
                if (partial > 0) {
                    this.money -= partial;
                    manager.earn(partial, 'gastro');
                }
                this.hunger = Math.max(0, this.hunger - 30);
                this.thirst = Math.max(0, this.thirst - 35);
                this.satisfaction = Math.max(0, this.satisfaction - 3);
                this.nextAction = 'Zu wenig Geld in Gastro';
            }
        } else if (this.serviceType === 'HOTEL') {
            this.hunger = Math.min(100, this.hunger + 3);
            this.thirst = Math.min(100, this.thirst + 2);
            this.bladder = Math.min(100, this.bladder + 2);
            this.hotelCheckInPending = false;
            this.nextAction = 'Hotel verlassen';
            this.completeWishForBuilding(targetBuilding);
        }

        this.needTargetType = null;
        this.needTargetBuildingId = null;
        this.serviceType = null;
        this.serviceBuildingId = null;
        this.serviceRemainingSec = 0;
        this.state = 'WAITING';
        this.syncToTerrain(manager, gridSize);
    }

    completeWish(wishId) {
        if (!wishId) return false;
        if (!Array.isArray(this.wishes) || !this.wishes.includes(wishId)) return false;
        if (!Array.isArray(this.completedWishes)) this.completedWishes = [];
        if (this.completedWishes.includes(wishId)) return false;

        this.completedWishes.push(wishId);
        // Explicit reward for fulfilling a specific guest wish.
        this.satisfaction = Math.min(100, this.satisfaction + 8);
        this.nextAction = `Wunsch erfüllt: ${wishId}`;
        return true;
    }

    completeWishForBuilding(building) {
        const buildingId = building?.type?.id;
        if (!buildingId) return false;
        return this.completeWish(buildingId);
    }

    getPreferredPisteDifficulty() {
        return this.slopePreference === 'GREEN' ? 'BLUE' : this.slopePreference;
    }

    getPisteDifficulty(piste) {
        return piste?.avgDifficulty || piste?.segments?.[Math.max(0, (piste?.segments?.length || 1) - 1)]?.difficulty || 'BLUE';
    }

    getPisteDifficultyFit(difficulty) {
        const pref = this.getPreferredPisteDifficulty();
        if (difficulty === pref) return 1;
        if (pref === 'BLUE') return difficulty === 'RED' ? 0.35 : 0.05;
        if (pref === 'RED') return difficulty === 'BLUE' ? 0.78 : 0.45;
        if (pref === 'BLACK') return difficulty === 'RED' ? 0.82 : 0.18;
        return 0.4;
    }

    getPisteCrowding(manager, pisteId, entryPoint = null) {
        if (!pisteId || !manager?.guests?.length) return 0;
        let activeCount = 0;
        let nearEntryCount = 0;

        for (const guest of manager.guests) {
            if (!guest || guest === this || guest.shouldRemove) continue;
            const targetsPiste = guest.activePisteId === pisteId || guest.postRideRoute?.pisteId === pisteId;
            if (!targetsPiste) continue;

            activeCount += 1;
            if (entryPoint) {
                const dx = (guest.x || 0) - entryPoint.x;
                const dy = (guest.y || 0) - entryPoint.y;
                if ((dx * dx + dy * dy) <= 36) {
                    nearEntryCount += 1;
                }
            }
        }

        return activeCount * 1.1 + nearEntryCount * 2.4;
    }

    getLiftCrowding(manager, lift, startPoint = null, endPoint = null) {
        if (!lift?.id || !manager?.guests?.length) return 0;
        let targetingCount = 0;
        let queueCount = 0;
        let lowerStationCount = 0;
        let upperStationCount = 0;

        const startX = (startPoint?.x ?? lift.startTile?.x ?? lift.start?.x ?? 0) + 0.5;
        const startY = (startPoint?.y ?? lift.startTile?.y ?? lift.start?.y ?? 0) + 0.5;
        const endX = (endPoint?.x ?? lift.endTile?.x ?? lift.end?.x ?? 0) + 0.5;
        const endY = (endPoint?.y ?? lift.endTile?.y ?? lift.end?.y ?? 0) + 0.5;

        for (const guest of manager.guests) {
            if (!guest || guest === this || guest.shouldRemove) continue;
            if (guest.liftTargetId === lift.id) targetingCount += 1;
            if (guest.liftQueueLiftId === lift.id) queueCount += 1;

            const sx = (guest.x || 0) - startX;
            const sy = (guest.y || 0) - startY;
            if ((sx * sx + sy * sy) <= 64) {
                lowerStationCount += 1;
            }

            const ex = (guest.x || 0) - endX;
            const ey = (guest.y || 0) - endY;
            if ((ex * ex + ey * ey) <= 81) {
                upperStationCount += 1;
            }
        }

        return targetingCount * 1.35 + queueCount * 1.7 + lowerStationCount * 0.9 + upperStationCount * 0.55;
    }

    getVehicleReturnSpot(manager) {
        if (this.car?.parkingLot?.type?.id === 'parking_garage') {
            const lot = this.car.parkingLot;
            const { w, h } = manager.getBuildingFootprint(lot);
            return {
                x: lot.x + w * 0.5 + this.returnVehicleOffset.x * 0.4,
                y: lot.y + h + 0.8 + this.returnVehicleOffset.y * 0.25
            };
        }

        if (Number.isFinite(this.car?.x) && Number.isFinite(this.car?.y)) {
            return {
                x: this.car.x + this.returnVehicleOffset.x,
                y: this.car.y + this.returnVehicleOffset.y
            };
        }

        if (this.car?.parkingLot) {
            return this.getBuildingAccessSpot(this.car.parkingLot, manager);
        }

        const parking = this.findNearestBuilding(
            manager,
            (b) => ['parking_lot', 'parking_garage', 'bus_stop'].includes(b.type?.id)
        );
        return parking ? this.getBuildingAccessSpot(parking, manager) : null;
    }

    completeDeparture(manager) {
        if (this.car) {
            this.car.requestDeparture = true;
            this.car.waitingPassengers = Math.max(0, (this.car.waitingPassengers || 0) - 1);
            if ((this.car.waitingPassengers || 0) <= 0 && this.car.parkingLot?.type?.id === 'parking_garage') {
                this.car.shouldDespawnAtDayEnd = true;
            }
        }
        this.hotelBuildingId = null;
        this.shouldRemove = true;
    }

    updateDeparture(dtSec, manager, gridSize) {
        if (!this.departureStarted) {
            this.departureStarted = true;
            this.departureTimer = 0;
            this.departureRepathTimer = 0;
            this.leaveLiftQueue(manager);
            this.state = 'WALKING';
            this.needTargetType = null;
            this.needTargetBuildingId = null;
            this.serviceType = null;
            this.serviceBuildingId = null;
            this.serviceRemainingSec = 0;
            this.postRideStep = null;
            this.postRideRoute = null;
            this.postRideEndPoint = null;
            this.skiRoute = null;
            this.skiRouteCumLen = null;
            this.skiRouteLength = 0;
            this.skiDistance = 0;
            this.hasSkis = false;
            this.activePisteId = null;
            this.nextAction = 'Zum Parkplatz';
            const returnSpot = this.getVehicleReturnSpot(manager);
            if (returnSpot) {
                this.setTarget(manager, gridSize, returnSpot);
            } else {
                this.completeDeparture(manager);
                return;
            }
        }

        this.departureTimer += dtSec;
        this.departureRepathTimer += dtSec;
        const liveReturnSpot = this.getVehicleReturnSpot(manager);
        if (liveReturnSpot) {
            const d = Math.sqrt((this.x - liveReturnSpot.x) ** 2 + (this.y - liveReturnSpot.y) ** 2);
            if (d <= 1.15) {
                this.completeDeparture(manager);
                return;
            }
            if (
                this.departureRepathTimer >= 2.5 &&
                (!this.targetPos || Math.sqrt((this.targetPos.x - liveReturnSpot.x) ** 2 + (this.targetPos.y - liveReturnSpot.y) ** 2) > 1.0)
            ) {
                this.departureRepathTimer = 0;
                this.setTarget(manager, gridSize, liveReturnSpot);
            }
        }

        const reached = this.advanceMovement(dtSec, gridSize);
        this.walkPhase += dtSec * 7;
        this.syncToTerrain(manager, gridSize);

        if (reached) {
            this.completeDeparture(manager);
            return;
        }

        if (this.blocked) {
            const fallback = this.getUnstuckTarget(manager, gridSize, null);
            if (fallback) this.setTarget(manager, gridSize, fallback);
        }

        if (this.departureTimer >= 35) {
            this.completeDeparture(manager);
        }
    }

    static pickCategoryKey() {
        const entries = Object.entries(GUEST_CATEGORIES);
        const total = entries.reduce((sum, [, cat]) => sum + (cat.basePercentage || 0), 0);
        let roll = Math.random() * total;
        for (const [key, cat] of entries) {
            roll -= (cat.basePercentage || 0);
            if (roll <= 0) return key;
        }
        return entries[0]?.[0] || 'MIDDLE_CLASS';
    }

    static buildWishes(category) {
        if (!category || !category.preferences) return [];
        return Object.entries(category.preferences)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([id]) => id);
    }

    static pickSlopePreference() {
        // Mostly red, some green, few black
        const roll = Math.random() * 100;
        if (roll < 20) return 'GREEN';
        if (roll < 90) return 'RED';
        return 'BLACK';
    }

    setTarget(manager, gridSize, targetPos) {
        if (!targetPos) return;
        this.atTarget = false;
        this.blocked = false;

        // Ensure current position is inside the map and not inside a building
        if (this.x < 0 || this.y < 0 || this.x >= gridSize || this.y >= gridSize || manager.isTileBlockedForGuests(Math.floor(this.x), Math.floor(this.y))) {
            const startFix = manager.findNearestWalkableTile(this.x, this.y, gridSize, 12, true);
            if (startFix) {
                this.x = startFix.x + 0.5;
                this.y = startFix.y + 0.5;
            }
        }

        const clamped = {
            x: Math.max(0, Math.min(gridSize - 1, targetPos.x)),
            y: Math.max(0, Math.min(gridSize - 1, targetPos.y))
        };

        // Find nearest walkable tile (avoid buildings)
        let nearest = manager.findNearestWalkableTile(clamped.x, clamped.y, gridSize, 6, true);
        if (!nearest) nearest = manager.findNearestWalkableTile(clamped.x, clamped.y, gridSize, 12, true);
        if (!nearest) {
            this.targetPos = null;
            this.path = [];
            return;
        }

        const goalX = nearest.x + 0.5;
        const goalY = nearest.y + 0.5;
        this.targetPos = { x: goalX, y: goalY };
        this.path = manager.findGuestPath(this.x, this.y, goalX, goalY, gridSize);
        if (this.path.length === 0) {
            const dist = Math.sqrt((this.x - goalX) ** 2 + (this.y - goalY) ** 2);
            if (dist > 0.75) {
                // Robust fallback so guests do not freeze if A* fails in open resort areas.
                this.path = [{ x: goalX, y: goalY }];
            }
        }
    }

    advanceMovement(dtSec, gridSize) {
        if (!this.targetPos) return this.atTarget && !this.blocked;

        const nextTarget = this.path && this.path.length > 0 ? this.path[0] : this.targetPos;
        const reached = this.moveTowards(nextTarget, dtSec);

        if (reached) {
            if (this.path && this.path.length > 0) {
                this.path.shift();
                if (this.path.length === 0) {
                    // Snap to final target
                    this.x = this.targetPos.x;
                    this.y = this.targetPos.y;
                    this.targetPos = null;
                    this.atTarget = true;
                    return true;
                }
            } else {
                this.targetPos = null;
                this.atTarget = true;
                return true;
            }
        }

        // Keep inside bounds
        this.x = Math.max(0, Math.min(gridSize - 1, this.x));
        this.y = Math.max(0, Math.min(gridSize - 1, this.y));
        return false;
    }

    moveTowards(target, dtSec) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0.001) {
            this.x = target.x;
            this.y = target.y;
            return true;
        }

        const step = this.speed * dtSec;
        if (step >= dist) {
            this.x = target.x;
            this.y = target.y;
            return true;
        }

        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        return false;
    }

    getQueueTarget(ticketOffice, manager, gridSize) {
        const { w, h } = manager.getBuildingFootprint(ticketOffice);
        if (ticketOffice.type?.id === 'ticket_office') {
            // Force queue onto the ticket office asphalt footprint.
            // Counter is around the lower-middle of the footprint in current art.
            const spacing = 0.55;
            const queueCols = Math.max(1, Math.floor((w - 1.4) / spacing));
            const col = this.queuePosition % queueCols;
            const row = Math.floor(this.queuePosition / queueCols);

            const minX = ticketOffice.x + 0.7;
            const maxX = ticketOffice.x + w - 0.7;
            const counterY = ticketOffice.y + h * 0.62;
            const targetX = Math.min(maxX, minX + col * spacing);
            const targetY = Math.min(ticketOffice.y + h - 0.7, counterY + row * spacing);

            return { x: targetX, y: targetY };
        }
        if (!ticketOffice.queueFrontDir) {
            const centerX = ticketOffice.x + w / 2;
            const centerY = ticketOffice.y + h / 2;
            const directions = [
                { x: 0, y: -1 }, // north
                { x: 0, y: 1 },  // south
                { x: -1, y: 0 }, // west
                { x: 1, y: 0 }   // east
            ];
            let best = directions[0];
            let bestRoadScore = -1;
            let bestFreeScore = -1;
            for (const dir of directions) {
                let roadScore = 0;
                let freeScore = 0;
                for (let i = 1; i <= 6; i++) {
                    const tx = Math.floor(centerX + dir.x * (w / 2 + i));
                    const ty = Math.floor(centerY + dir.y * (h / 2 + i));
                    if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) break;
                    if (manager.isRoadTile(tx, ty)) roadScore++;
                    if (!manager.isTileBlocked(tx, ty)) freeScore++;
                }
                if (roadScore > bestRoadScore || (roadScore === bestRoadScore && freeScore > bestFreeScore)) {
                    bestRoadScore = roadScore;
                    bestFreeScore = freeScore;
                    best = dir;
                }
            }
            ticketOffice.queueFrontDir = best;
        }
        const frontDir = ticketOffice.queueFrontDir;
        const spacing = 0.6;
        const centerX = ticketOffice.x + w / 2;
        const centerY = ticketOffice.y + h / 2;
        // Find closest road tile around the ticket office (stay on asphalt)
        let base = null;
        let bestDist = Infinity;
        const maxR = 10;
        for (let r = 0; r <= maxR; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tx = Math.floor(centerX + dx);
                    const ty = Math.floor(centerY + dy);
                    if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) continue;
                    if (manager.isRoadTile(tx, ty)) {
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist < bestDist) {
                            bestDist = dist;
                            base = { x: tx + 0.5, y: ty + 0.5 };
                        }
                    }
                }
            }
            if (base) break;
        }

        // Determine queue direction along road
        let dir = frontDir;
        if (base) {
            const bx = Math.floor(base.x);
            const by = Math.floor(base.y);
            const east = manager.isRoadTile(bx + 1, by);
            const west = manager.isRoadTile(bx - 1, by);
            const north = manager.isRoadTile(bx, by - 1);
            const south = manager.isRoadTile(bx, by + 1);
            if ((east || west) && !(north || south)) dir = { x: 1, y: 0 };
            else if ((north || south) && !(east || west)) dir = { x: 0, y: 1 };
        }

        const fallback = {
            x: centerX + frontDir.x * (w / 2 + 0.1),
            y: centerY + frontDir.y * (h / 2 + 0.1)
        };
        const anchor = base || fallback;
        return {
            x: anchor.x + dir.x * (this.queuePosition * spacing),
            y: anchor.y + dir.y * (this.queuePosition * spacing)
        };
    }

    getWaitingSpot(ticketOffice, manager) {
        const { w, h } = manager.getBuildingFootprint(ticketOffice);
        if (ticketOffice.type?.id === 'ticket_office') {
            // Keep waiting guests on the same asphalt area
            return { x: ticketOffice.x + w - 0.9, y: ticketOffice.y + h - 0.9 };
        }
        const frontDir = ticketOffice.queueFrontDir || { x: 0, y: -1 };
        const sideDir = { x: -frontDir.y, y: frontDir.x };
        const side = Math.random() < 0.5 ? -1 : 1;
        const centerX = ticketOffice.x + w / 2;
        const centerY = ticketOffice.y + h / 2;
        return {
            x: centerX + sideDir.x * (w / 2 + 1.2) * side,
            y: centerY + sideDir.y * (h / 2 + 1.2) * side
        };
    }

    getCounterWindowSpot(ticketOffice, manager) {
        const { w, h } = manager.getBuildingFootprint(ticketOffice);
        if (ticketOffice.type?.id === 'ticket_office') {
            // Schalter roughly at lower-middle in current drawing
            return {
                x: ticketOffice.x + w * 0.48,
                y: ticketOffice.y + h * 0.64
            };
        }
        return this.getQueueTarget(ticketOffice, manager, manager.gridSize || 256);
    }

    getWaitingClusterSpot(ticketOffice, manager) {
        const { w, h } = manager.getBuildingFootprint(ticketOffice);
        if (ticketOffice.type?.id === 'ticket_office') {
            // Three cluster anchors on asphalt near the side of the kiosk
            const anchors = [
                { x: ticketOffice.x + w * 0.75, y: ticketOffice.y + h * 0.80 },
                { x: ticketOffice.x + w * 0.62, y: ticketOffice.y + h * 0.86 },
                { x: ticketOffice.x + w * 0.86, y: ticketOffice.y + h * 0.72 }
            ];
            const a = anchors[this.id % anchors.length];
            const jitter = ((this.id * 37) % 10) / 100; // deterministic spread
            return { x: a.x + jitter, y: a.y - jitter };
        }
        return this.getWaitingSpot(ticketOffice, manager);
    }

    getQueueFallbackTarget(ticketOffice, manager, gridSize) {
        const { w, h } = manager.getBuildingFootprint(ticketOffice);
        if (ticketOffice.type?.id === 'ticket_office') {
            const spacing = 0.55;
            const queueCols = Math.max(1, Math.floor((w - 1.4) / spacing));
            const col = this.queuePosition % queueCols;
            const row = Math.floor(this.queuePosition / queueCols);
            const minX = ticketOffice.x + 0.7;
            const maxX = ticketOffice.x + w - 0.7;
            const minY = ticketOffice.y + h * 0.62;
            const maxY = ticketOffice.y + h - 0.7;
            const x = Math.min(maxX, minX + col * spacing);
            const y = Math.min(maxY, minY + row * spacing);
            return { x, y };
        }
        const cx = ticketOffice.x + w / 2;
        const cy = ticketOffice.y + h / 2;
        const maxR = 8;

        for (let r = 1; r <= maxR; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tx = Math.floor(cx + dx);
                    const ty = Math.floor(cy + dy);
                    if (tx < 0 || ty < 0 || tx >= gridSize || ty >= gridSize) continue;
                    if (!manager.isTileBlocked(tx, ty)) {
                        return { x: tx + 0.5, y: ty + 0.5 };
                    }
                }
            }
        }
        return null;
    }

    getUnstuckTarget(manager, gridSize, ticketOffice) {
        if (ticketOffice) {
            const { w, h } = manager.getBuildingFootprint(ticketOffice);
            if (ticketOffice.type?.id === 'ticket_office') {
                const minX = ticketOffice.x + 0.7;
                const maxX = ticketOffice.x + w - 0.7;
                const minY = ticketOffice.y + h * 0.62;
                const maxY = ticketOffice.y + h - 0.7;
                return {
                    x: minX + Math.random() * Math.max(0.1, (maxX - minX)),
                    y: minY + Math.random() * Math.max(0.1, (maxY - minY))
                };
            }
            const cx = ticketOffice.x + w / 2;
            const cy = ticketOffice.y + h / 2;
            const jitterX = (Math.random() - 0.5) * 4;
            const jitterY = (Math.random() - 0.5) * 4;
            const candidate = manager.findNearestWalkableTile(cx + jitterX, cy + jitterY, gridSize, 10, true);
            if (candidate) return { x: candidate.x + 0.5, y: candidate.y + 0.5 };
        }

        const candidate = manager.findNearestWalkableTile(this.x, this.y, gridSize, 10, true);
        if (candidate) return { x: candidate.x + 0.5, y: candidate.y + 0.5 };
        return null;
    }
}

/**
 * Lift System Logic
 * Manages lift terminals, cables, and passengers.
 */

// ===============================================
// TRAFFIC VEHICLE (Cars & Buses)
// ===============================================
export class TrafficVehicle {
    constructor(id) {
        this.id = id;
        // Types: 'car', 'bus'
        const isBus = Math.random() < 0.2;
        this.type = isBus ? 'bus' : 'car';
        this.subtype = this.type === 'car' ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 2);

        // Colors
        // Realistische Palette: Weiß/Silber/Grau/Schwarz dominieren,
        // dezente Blau-/Rottöne als Akzent — keine grellen Farben mehr.
        const carColors = ['#e5e7eb', '#e5e7eb', '#9ca3af', '#9ca3af', '#4b5563', '#1f2937', '#1e3a5f', '#6b1f2a', '#d6d3d1'];
        const busColors = ['#c2410c', '#1d4ed8', '#f8fafc', '#334155'];
        this.color = this.type === 'car'
            ? carColors[Math.floor(Math.random() * carColors.length)]
            : busColors[Math.floor(Math.random() * busColors.length)];

        // Start just outside the left road entrance so vehicles visibly enter via the road.
        this.dir = { x: 1, y: 0 };
        this.x = -0.55;
        this.y = 10.5 + 0.25;
        this.z = 0;
        this.rotation = 0;

        // CRITICAL: Store spawn point for exit enforcement
        this.spawnPoint = { x: -1, y: 10 };

        this.speed = this.type === 'car' ? 4.0 : 2.5;
        this.state = 'DRIVING';
        if (this.type === 'bus') {
            this.plannedStayDays = 2 + Math.floor(Math.random() * 4); // 2-5 days
        } else {
            const roll = Math.random();
            if (roll < 0.18) this.plannedStayDays = 1;              // minority day guests
            else if (roll < 0.73) this.plannedStayDays = 2 + Math.floor(Math.random() * 3); // 2-4
            else this.plannedStayDays = 5 + Math.floor(Math.random() * 5); // 5-9
        }

        // Navigation Logic
        this.currentTile = { x: -1, y: 10 };
        this.nextTile = { x: 0, y: 10 };

        // Motion State
        this.moveMode = 'LINEAR'; // 'LINEAR' or 'BEZIER'
        this.startPos = { x: this.x, y: this.y };
        this.targetPos = { x: 0.5, y: 10.75 }; // First visible road entry
        this.controlPos = null;
        this.progress = 0;
        this.duration = 1.0;

        // Multi-lane support: assign random lane (0 = right, 1 = left)
        this.lane = Math.random() < 0.5 ? 0 : 1;

        // Guest spawning flags
        this.hasSpawnedGuests = false;
        this.hasSpawnedFromGarage = false;
        this.waitingPassengers = 0;
        this.requestDeparture = false;
        this.shouldDespawnAtDayEnd = false;

        // Calculate initial target
        this.updateTargetAndMode({ x: 1, y: 0 });
    }

    isAllowedVehicleSurface(manager, tileX, tileY) {
        if (!manager) return false;
        if (manager._hasRoadAt(tileX, tileY)) return true;

        for (const building of manager.buildings || []) {
            const typeId = building?.type?.id;
            if (!['parking_lot', 'parking_garage', 'bus_stop'].includes(typeId)) continue;
            const { w, h } = typeof manager.getBuildingFootprint === 'function'
                ? manager.getBuildingFootprint(building)
                : {
                    w: building?.type?.size?.width || 1,
                    h: building?.type?.size?.height || 1
                };
            if (tileX >= building.x && tileX < building.x + w && tileY >= building.y && tileY < building.y + h) {
                return true;
            }
        }
        return false;
    }

    updateTargetAndMode(forcedDir, oldDir) {
        // Calculate target position based on nextTile and dir
        const getLanePos = (tx, ty, dx, dy, manager) => {
            const cx = tx + 0.5;
            const cy = ty + 0.5;

            // Right-hand traffic: use right road tile if available
            const perpX = -dy;
            const perpY = dx;

            if (manager) {
                const hasRightRoad = manager._hasRoadAt(tx + perpX, ty + perpY);
                if (hasRightRoad) {
                    // Double Lane: Use right-hand road tile center
                    return { x: (tx + perpX) + 0.5, y: (ty + perpY) + 0.5 };
                }
            }

            // Single Lane: Offset by 0.25 to the right
            const offset = 0.25;
            return { x: cx + perpX * offset, y: cy + perpY * offset };
        };

        const target = getLanePos(this.nextTile.x, this.nextTile.y, this.dir.x, this.dir.y, null);

        // Check mode (Updated Logic)

        if (forcedDir) {
            // Init
            this.moveMode = 'LINEAR';
            this.targetPos = target;
            this.duration = 1.0; // dummy
            return;
        }

        // Detect turn
        // Calculate vector from start to target
        const dx = target.x - this.startPos.x;
        const dy = target.y - this.startPos.y;

        // If dot product with current orientation is ~0, it's a turn?
        // Or if distance is large?
        // Just rely on logic: Did direction change?
        // We stored oldDir before calling this?
        // We can infer from position.

        const dist = Math.sqrt(dx * dx + dy * dy);
        this.duration = dist / this.speed;
        if (this.duration < 0.01) this.duration = 0.1;

        this.targetPos = target;
        this.progress = 0;

        // Heuristic for turn: Distance is ~1.11 (diagonal) or ~1.0 (straight)
        // Straight: (0.5, 0.75) -> (1.5, 0.75). Dist 1.0.
        // Turn: (0.5, 0.75) -> (0.25, 1.5). Dist 1.11.
        // Check if endpoints align on X or Y axis
        const alignedX = Math.abs(this.startPos.x - this.targetPos.x) < 0.1;
        const alignedY = Math.abs(this.startPos.y - this.targetPos.y) < 0.1;

        if (alignedX || alignedY) {
            this.moveMode = 'LINEAR';
        } else {
            this.moveMode = 'BEZIER';
            // Control Point: (target.x, start.y) usually works for 90 deg turns on grid?
            // East -> South. Start(0.5, 0.75). Target(0.25, 1.5).
            // (0.25, 0.75) is correct.
            // East -> North. Start(0.5, 0.75). Target(0.25, -0.5).
            // (0.25, 0.75) is correct.
            // So: x = target.x, y = start.y?
            // Let's verify South -> West.
            // Start(0.25, 0.5 - 1). Target(-0.5, 0.25).
            // CP(target.x, start.y) -> (-0.5, -0.5).
            // Correct.

            // Wait, what if West -> South?
            // Start(0.5, 0.25). Target(0.25, 1.5). (Moving West, Turn Left to South)
            // CP(target.x, start.y) -> (0.25, 0.25). Correct.

            // It seems CP is always (target.x, start.y) IF we move X then Y?
            // What if we move Y then X?
            // South -> East.
            // Start(0.25, 0.5). Target(1.5, 0.75).
            // CP(1.5, 0.5)? 
            // Start is left-side (0.25). Target is bottom-side (0.75).
            // Intersection is (0.25, 0.75).
            // My formula (target.x, start.y) -> (1.5, 0.5). WRONG.

            // We need intersection of [Start + Dir_Old * k] and [Target - Dir_New * k].
            // Start(0.25, 0.5). Old Dir (0, 1). Line: x=0.25.
            // Target(1.5, 0.75). New Dir (1, 0). Line: y=0.75.
            // Intersection: (0.25, 0.75).
            // This is (start.x, target.y).

            // So it depends on if we were moving Vert or Horz.
            // If Old Dir was Vert (dy!=0): x = start.x.
            // If Old Dir was Horz (dx!=0): y = start.y.

            // Need to know Previous Direction.
            // We can infer from startPos relative to tile center? No.
            // We can just check `this.dir`.
            // But `this.dir` is already updated to New Dir before calling this?
            // No, we update `this.dir` IN the update loop.

            // Let's pass oldDir to this function or check `moveMode`.
            // Actually, `this.dir` represents the NEXT move direction when we call this?
            // See logic below.
        }
    }

    update(dt, manager, gridSize, heightmap) {
        if (this.shouldRemove) return true;
        if (this.shouldDespawnAtDayEnd) {
            if (this.parkingLot?.currentOccupancy > 0) {
                this.parkingLot.currentOccupancy--;
            }
            this.shouldRemove = true;
            return true;
        }

        const dtSec = dt / 1000;

        // Z-Interp (Same as before)
        const getZ = (x, y) => {
            if (x < 0 || x >= gridSize - 1 || y < 0 || y >= gridSize - 1) return 10;
            const ix = Math.floor(x); const iy = Math.floor(y);
            const fx = x - ix; const fy = y - iy;
            const h00 = heightmap[iy * gridSize + ix] || 10;
            const h10 = heightmap[iy * gridSize + (ix + 1)] || 10;
            const h01 = heightmap[(iy + 1) * gridSize + ix] || 10;
            const h11 = heightmap[(iy + 1) * gridSize + (ix + 1)] || 10;
            return (h00 + (h10 - h00) * fx) * (1 - fy) + (h01 + (h11 - h01) * fx) * fy;
        };
        this.z = getZ(this.x, this.y) + 0.1;

        if (this.state === 'DRIVING' || this.state === 'FINDING_EXIT') {
            // 0. Give Up Timer Logic
            if (this.giveUpTimer > 0) {
                this.giveUpTimer += dtSec;
                if (this.giveUpTimer > 10.0) {
                    // Timeout -> Bubble -> Leave IMMEDIATELY
                    if (!this.hasComplained) {
                        /* Sprechblase entfernt */
                        this.hasComplained = true;
                    }
                    this.state = 'FINDING_EXIT';
                    this.giveUpTimer = 0; // Reset to prevent re-triggering
                    return false;
                }
            }

            // 1. Collision Check
            if (manager.traffic) {
                const blocked = manager.traffic.some(other => {
                    if (other === this) return false;
                    if (other.state.startsWith('PARKING')) return false;
                    const dx = other.x - this.x;
                    const dy = other.y - this.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > 2.25) return false;
                    const distForward = dx * this.dir.x + dy * this.dir.y;
                    // Lateral dist must be smaller to allow 2-lane traffic (lanes are 0.5 apart)
                    // 0.3 ensures valid parallel traffic (delta 0.5) is IGNORED
                    const distLateral = Math.abs(dx * (-this.dir.y) + dy * this.dir.x);
                    return (distForward > 0 && distForward < 1.2 && distLateral < 0.3);
                });
                if (blocked) {
                    this.blockedTime = (this.blockedTime || 0) + dtSec;
                    if (this.blockedTime > 1.0) {
                        const wiggle = Math.sin(this.blockedTime * 3) * 0.005;
                        this.x += this.dir.x * wiggle * dtSec;
                        this.y += this.dir.y * wiggle * dtSec;
                    }
                    if (this.blockedTime < 5.0) return false;
                } else {
                    this.blockedTime = 0;
                }
            }

            // 2. Movement
            this.progress += dtSec / this.duration;

            if (this.progress >= 1.0) {
                // Arrived at Target
                this.x = this.targetPos.x;
                this.y = this.targetPos.y;
                this.currentTile = { ...this.nextTile };
                this.startPos = { x: this.x, y: this.y };

                // --- PARKING CHECK ---
                // Only try to park if we haven't given up yet (AND not finding exit)
                if (this.state === 'DRIVING' && !this.giveUpTimer && this.type === 'car') {
                    const lots = manager.buildings
                        .filter(b => b.type.id === 'parking_lot' || b.type.id === 'parking_garage')
                        .sort((a, b) => {
                            const aGarage = a.type.id === 'parking_garage' ? 0 : 1;
                            const bGarage = b.type.id === 'parking_garage' ? 0 : 1;
                            if (aGarage !== bGarage) return aGarage - bGarage;

                            const aCapacity = Math.max(1, a.type?.capacity || (a.type.id === 'parking_garage' ? 500 : 36));
                            const bCapacity = Math.max(1, b.type?.capacity || (b.type.id === 'parking_garage' ? 500 : 36));
                            const aOcc = a.type.id === 'parking_garage'
                                ? Math.max(0, a.currentOccupancy || 0)
                                : manager.traffic.filter(v => v.parkingLot === a && v.state.startsWith('PARKING')).length;
                            const bOcc = b.type.id === 'parking_garage'
                                ? Math.max(0, b.currentOccupancy || 0)
                                : manager.traffic.filter(v => v.parkingLot === b && v.state.startsWith('PARKING')).length;
                            const aLoad = aOcc / aCapacity;
                            const bLoad = bOcc / bCapacity;
                            if (aLoad !== bLoad) return aLoad - bLoad;

                            const aDist = Math.abs((a.x + 4) - this.currentTile.x) + Math.abs((a.y + 4) - this.currentTile.y);
                            const bDist = Math.abs((b.x + 4) - this.currentTile.x) + Math.abs((b.y + 4) - this.currentTile.y);
                            return aDist - bDist;
                        });
                    let attemptedParking = false;

                    for (const lot of lots) {
                        attemptedParking = true;
                        const entries = [{ x: 3, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 7 }, { x: 4, y: 7 }];
                        const toWorld = (lx, ly) => {
                            let wx = lx; let wy = ly;
                            if (lot.rotation === 90) { wx = 7 - ly; wy = lx; }
                            else if (lot.rotation === 180) { wx = 7 - lx; wy = 7 - ly; }
                            else if (lot.rotation === 270) { wx = ly; wy = 7 - lx; }
                            return { x: lot.x + wx, y: lot.y + wy };
                        };
                        const validEntry = entries.map(e => toWorld(e.x, e.y)).find(e =>
                            Math.abs(e.x - this.currentTile.x) + Math.abs(e.y - this.currentTile.y) === 1
                        );

                        if (validEntry) {
                            if (lot.type.id === 'parking_garage') {
                                const garageCapacity = Math.max(1, lot.type?.capacity || 500);
                                const garageOccupied = Math.max(0, lot.currentOccupancy || 0);
                                if (garageOccupied >= garageCapacity) {
                                    continue;
                                }

                                const entryPath = [validEntry];
                                if (!entryPath.every(point => this.isAllowedVehicleSurface(manager, point.x, point.y))) {
                                    continue;
                                }

                                this.state = 'PARKING_ENTER';
                                this.parkingLot = lot;
                                this.parkingSpot = { lx: 3, ly: 0 };
                                this.parkingPath = entryPath;
                                this.pathIndex = 0;
                                this.nextTile = entryPath[0];
                                this.moveMode = 'LINEAR';
                                this.targetPos = { x: this.nextTile.x + 0.5, y: this.nextTile.y + 0.5 };
                                const ddx = this.targetPos.x - this.startPos.x;
                                const ddy = this.targetPos.y - this.startPos.y;
                                this.duration = Math.sqrt(ddx * ddx + ddy * ddy) / (this.speed * 0.5);
                                this.progress = 0;
                                this.dir = { x: Math.sign(ddx) || 0, y: Math.sign(ddy) || 0 };
                                this.rotation = Math.atan2(this.dir.y, this.dir.x);
                                return false;
                            }

                            const occupiedSpots = manager.traffic
                                .filter(v => v.parkingLot === lot && v.state.startsWith('PARKING'))
                                .map(v => `${v.parkingSpot.lx},${v.parkingSpot.ly}`);

                            // STRICT CAPACITY CHECK (Max 36)
                            if (occupiedSpots.length >= 36) {
                                // Lot is full. Do not queue.
                                continue;
                            }

                            const allSpots = [];
                            // 24 Spots: Rows 0,2,5,7; Cols 1-6
                            // 48 Spots: Rows 0,1,2,5,6,7; Cols 1-6
                            // ORDERED: Fill Row 6 first (Back), then 5... down to 1 (Front)
                            for (let lx of [0, 1, 2, 5, 6, 7]) {
                                for (let ly = 6; ly >= 1; ly--) {
                                    if (!occupiedSpots.includes(`${lx},${ly}`)) {
                                        allSpots.push({ lx, ly });
                                    }
                                }
                            }

                            if (allSpots.length > 0) {
                                // ORDERED PARKING: Pick the FIRST available spot
                                const freeSpot = allSpots[0];
                                const aisleX = 3;
                                const p1 = validEntry;
                                const p2 = toWorld(aisleX, freeSpot.ly);
                                const p3 = toWorld(freeSpot.lx, freeSpot.ly);
                                const parkingPath = [p1, p2, p3];
                                if (!parkingPath.every(point => this.isAllowedVehicleSurface(manager, point.x, point.y))) {
                                    continue;
                                }

                                this.state = 'PARKING_ENTER';
                                this.parkingLot = lot;
                                this.parkingSpot = freeSpot;
                                this.parkingPath = parkingPath;
                                this.pathIndex = 0;
                                // Skip first waypoint if we are already there
                                if (Math.abs(p1.x - this.x) < 1.2 && Math.abs(p1.y - this.y) < 1.2) {
                                    this.pathIndex = 1;
                                }

                                lot.currentOccupancy = (lot.currentOccupancy || 0) + 1;
                                this.nextTile = this.parkingPath[this.pathIndex];
                                this.moveMode = 'LINEAR';
                                this.targetPos = { x: this.nextTile.x + 0.5, y: this.nextTile.y + 0.5 };
                                const ddx = this.targetPos.x - this.startPos.x;
                                const ddy = this.targetPos.y - this.startPos.y;
                                this.duration = Math.sqrt(ddx * ddx + ddy * ddy) / (this.speed * 0.5);
                                this.progress = 0;
                                this.dir = { x: Math.sign(ddx) || 0, y: Math.sign(ddy) || 0 };
                                this.rotation = Math.atan2(this.dir.y, this.dir.x);
                                return false;
                            }
                        }
                    }

                    // If we tried to park (was near a lot) but didn't return (didn't park),
                    // it implies the lot was full (or we weren't at entry). 
                    // But we iterate all lots. If one was validEntry but full, we continue.

                    // Heuristic: If we are "trying" to park (random < 0.3) and we failed?
                    // Let's implement global "Full" check only if we fail locally?
                    // User said: "no parkingspace darf erst kommen wenn es keine plätze mehr gibt".
                    // This implies checking GLOBAL availability? Or just locally?
                    // Assume local failure -> Check Global.

                    if (attemptedParking) {
                        // We failed to park in the nearby lot. 
                        // Check if ANY lot has space?
                        const allLots = manager.buildings.filter(b => b.type.id === 'parking_lot' || b.type.id === 'parking_garage');
                        const totalCapacity = allLots.reduce((sum, lot) => sum + Math.max(1, lot.type?.capacity || (lot.type.id === 'parking_garage' ? 500 : 36)), 0);
                        const totalOccupied = allLots.reduce((sum, lot) => {
                            if (lot.type.id === 'parking_garage') {
                                return sum + Math.max(0, lot.currentOccupancy || 0);
                            }
                            return sum + manager.traffic.filter(v => v.parkingLot === lot && v.state.startsWith('PARKING')).length;
                        }, 0);

                        if (totalOccupied >= totalCapacity * 0.95) { // 95% full
                            if (!this.hasComplained) {
                                /* Sprechblase entfernt */
                                this.hasComplained = true;
                                this.state = 'FINDING_EXIT'; // Leave immediately
                                this.giveUpTimer = 0;
                            }
                        }
                    }

                } else if (this.state === 'DRIVING' && !this.giveUpTimer && this.type === 'bus') {
                    // BUS STOP LOGIC
                    const stops = manager.buildings.filter(b => b.type.id === 'bus_stop');
                    let nearestStop = null;
                    let minDist = Infinity;
                    for (const stop of stops) {
                        const d = Math.abs(stop.x - this.x) + Math.abs(stop.y - this.y);
                        if (d < minDist) { minDist = d; nearestStop = stop; }
                    }

                    if (nearestStop && minDist < 10) {
                        const stop = nearestStop;
                        const midX = Math.floor(stop.type.size.width / 2);
                        const midY = Math.floor(stop.type.size.height / 2);

                        const entry1 = { x: midX, y: 0 };
                        const entry2 = { x: midX, y: stop.type.size.height - 1 };

                        const toWorld = (lx, ly) => {
                            let rx = lx; let ry = ly;
                            const w = stop.type.size.width; const h = stop.type.size.height;
                            if (stop.rotation === 90) { rx = (h - 1) - ly; ry = lx; }
                            else if (stop.rotation === 180) { rx = (w - 1) - lx; ry = (h - 1) - ly; }
                            else if (stop.rotation === 270) { rx = ly; ry = (w - 1) - lx; }
                            return { x: stop.x + rx, y: stop.y + ry };
                        };

                        const wE1 = toWorld(entry1.x, entry1.y);
                        const wE2 = toWorld(entry2.x, entry2.y);

                        const d1 = Math.abs(wE1.x - this.currentTile.x) + Math.abs(wE1.y - this.currentTile.y);
                        const d2 = Math.abs(wE2.x - this.currentTile.x) + Math.abs(wE2.y - this.currentTile.y);

                        let bestEntry = (d1 < d2) ? wE1 : wE2;

                        if (Math.min(d1, d2) <= 1) {
                            const slots = [
                                // Rows 6, 4, 2 (Back to Front)
                                { x: midX - 1, y: 6 }, { x: midX, y: 6 },
                                { x: midX - 1, y: 4 }, { x: midX, y: 4 },
                                { x: midX - 1, y: 2 }, { x: midX, y: 2 }
                            ];

                            const occupied = manager.traffic
                                .filter(v => v.parkingLot === stop && v.state.startsWith('PARKING'))
                                .map(v => `${v.parkingSpot.x},${v.parkingSpot.y}`);

                            const free = slots.filter(s => !occupied.includes(`${s.x},${s.y}`));

                            if (free.length > 0) {
                                // ORDERED: First free spot
                                const spot = free[0];
                                const parkingPath = [bestEntry, toWorld(spot.x, spot.y)];
                                if (parkingPath.every(point => this.isAllowedVehicleSurface(manager, point.x, point.y))) {
                                    this.state = 'PARKING_ENTER';
                                    this.parkingLot = stop;
                                    this.parkingSpot = spot;
                                    this.parkingPath = parkingPath;
                                    this.pathIndex = 0;
                                    // Skip first waypoint if close
                                    if (Math.abs(bestEntry.x - this.x) < 1.2 && Math.abs(bestEntry.y - this.y) < 1.2) {
                                        this.pathIndex = 1;
                                    }

                                    this.parkingLot.currentOccupancy = (this.parkingLot.currentOccupancy || 0) + 1;
                                    this.nextTile = this.parkingPath[this.pathIndex];
                                    this.moveMode = 'LINEAR';
                                    this.targetPos = { x: this.nextTile.x + 0.5, y: this.nextTile.y + 0.5 };
                                    const ddx = this.targetPos.x - this.startPos.x;
                                    const ddy = this.targetPos.y - this.startPos.y;
                                    this.duration = Math.sqrt(ddx * ddx + ddy * ddy) / (this.speed * 0.5);
                                    this.progress = 0;
                                    this.dir = { x: Math.sign(ddx) || 0, y: Math.sign(ddy) || 0 };
                                    this.rotation = Math.atan2(this.dir.y, this.dir.x);
                                    return false;
                                }
                            } else {
                                // Bus Stop Full
                                if (!this.hasComplained) {
                                    /* Sprechblase entfernt */
                                    this.hasComplained = true;
                                    this.giveUpTimer = 0.1;
                                }
                            }
                        }
                    }
                }

                // --- NEXT MOVE ---
                const neighbors = manager.getRoadNeighbors(this.currentTile.x, this.currentTile.y, gridSize);
                const candidates = [];
                if ((neighbors & 1) && !(this.dir.x === 0 && this.dir.y === 1)) candidates.push({ x: 0, y: -1 });
                if ((neighbors & 2) && !(this.dir.x === -1 && this.dir.y === 0)) candidates.push({ x: 1, y: 0 });
                if ((neighbors & 4) && !(this.dir.x === 0 && this.dir.y === -1)) candidates.push({ x: 0, y: 1 });
                if ((neighbors & 8) && !(this.dir.x === 1 && this.dir.y === 0)) candidates.push({ x: -1, y: 0 });

                let newDir = this.dir;

                // SMART EXIT LOGIC - ENFORCE SPAWN POINT EXIT ONLY
                if (this.state === 'FINDING_EXIT') {
                    // CRITICAL: Navigate ONLY to spawn point (where vehicle entered)
                    const targetX = this.spawnPoint.x;
                    const targetY = this.spawnPoint.y;

                    // Filter candidates to ONLY allow moves toward spawn
                    if (candidates.length > 0) {
                        // Sort candidates by distance to spawn point
                        const sorted = candidates.map(c => {
                            const nx = this.currentTile.x + c.x;
                            const ny = this.currentTile.y + c.y;
                            const dist = (nx - targetX) ** 2 + (ny - targetY) ** 2;
                            return { dir: c, dist };
                        }).sort((a, b) => a.dist - b.dist);

                        newDir = sorted[0].dir;
                    }
                } else if (candidates.length > 0) {
                    const straight = candidates.find(c => c.x === this.dir.x && c.y === this.dir.y);
                    if (straight && Math.random() < 0.7) newDir = straight;
                    else newDir = candidates[Math.floor(Math.random() * candidates.length)];
                } else {
                    this.state = 'U_TURN';
                    this.timer = 0;
                    return false;
                }

                const oldDir = this.dir;
                this.dir = newDir;
                this.nextTile = { x: this.currentTile.x + this.dir.x, y: this.currentTile.y + this.dir.y };

                // CRITICAL: Check if nextTile is valid ROAD before proceeding
                if (this.nextTile.x >= 0 && this.nextTile.x < gridSize && this.nextTile.y >= 0 && this.nextTile.y < gridSize) {
                    if (!manager._hasRoadAt(this.nextTile.x, this.nextTile.y)) {
                        // SNOW/OFF-ROAD DETECTED -> Force U-Turn
                        console.warn(`Vehicle ${this.id} tried to enter SNOW at (${this.nextTile.x}, ${this.nextTile.y})! Forcing U-Turn.`);
                        this.state = 'U_TURN';
                        this.timer = 0;
                        return false;
                    }
                }

                if (this.nextTile.x < 0) {
                    // ULTRA-STRICT EXIT: Must be at EXACT spawn point
                    // Only allow despawn if at spawn coordinates (±1 tolerance)
                    if (Math.abs(this.nextTile.y - this.spawnPoint.y) <= 1) {
                        // CORRECT EXIT (Spawn Point) -> DESPAWN
                        this.shouldRemove = true;
                        return true;
                    }
                    // WRONG EXIT (Not spawn point) -> Force U-Turn
                    console.warn(`Vehicle ${this.id} tried to exit at wrong Y (${this.nextTile.y} vs spawn ${this.spawnPoint.y})! Forcing U-Turn.`);
                    this.state = 'U_TURN';
                    this.timer = 0;
                    return false;
                }

                if (this.nextTile.x >= gridSize || this.nextTile.y < 0 || this.nextTile.y >= gridSize) {
                    // OTHER EDGES -> U-TURN
                    // Even if finding exit, we hit the wrong wall. Turn around.
                    this.state = 'U_TURN';
                    this.timer = 0;
                    return false;
                }

                this.updateTargetAndMode(false, oldDir);

            } else {
                // Moving (Linear/Bezier)
                if (this.moveMode === 'LINEAR') {
                    this.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * this.progress;
                    this.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * this.progress;
                    this.rotation = Math.atan2(this.dir.y, this.dir.x);
                } else {
                    const p0 = this.startPos;
                    const p1 = this.controlPos;
                    const p2 = this.targetPos;

                    // Safety Guard for Crash Prevention
                    if (!p0 || !p1 || !p2) {
                        console.warn("Traffic Crash Prevented:", { p0, p1, p2, mode: this.moveMode, id: this.id });
                        this.moveMode = 'LINEAR';
                        if (p0 && p2) {
                            // Fallback to Linear
                            this.x = p0.x + (p2.x - p0.x) * this.progress;
                            this.y = p0.y + (p2.y - p0.y) * this.progress;
                        }
                        return false;
                    }

                    const t = this.progress;
                    const invT = 1 - t;
                    this.x = invT * invT * p0.x + 2 * invT * t * p1.x + t * t * p2.x;
                    this.y = invT * invT * p0.y + 2 * invT * t * p1.y + t * t * p2.y;

                    const tx = 2 * invT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
                    const ty = 2 * invT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
                    const len = Math.sqrt(tx * tx + ty * ty);
                    if (len > 0.001) this.rotation = Math.atan2(ty, tx);
                }
            }

        } else if (this.state === 'PARKING_ENTER' || this.state === 'PARKING_EXIT') {
            this.progress += dtSec / this.duration;

            // Linear Move Logic
            this.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * this.progress;
            this.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * this.progress;

            if (this.progress >= 1.0) {
                // Reached Waypoint
                this.pathIndex++;
                const path = this.state === 'PARKING_ENTER' ? this.parkingPath : this.exitPath;

                if (this.pathIndex >= path.length || (this.state === 'PARKING_ENTER' && this.pathIndex >= 1 && this.parkingLot?.type?.id === 'parking_garage')) {
                    // Finished Path OR entered Garage (early despawn)
                    if (this.state === 'PARKING_ENTER') {
                        // Check if it's a parking GARAGE (Despawn)
                        if (this.type === 'car' && this.parkingLot && this.parkingLot.type.id === 'parking_garage') {
                            const fee = this.parkingLot.customPrice !== undefined && this.parkingLot.customPrice !== null
                                ? this.parkingLot.customPrice
                                : (this.parkingLot.type.basePrice || 18);
                            manager.earn(fee, 'parking');

                            if (!this.parkingLot.currentOccupancy) this.parkingLot.currentOccupancy = 0;
                            if (this.parkingLot.currentOccupancy < (this.parkingLot.type.capacity || 500)) {
                                this.parkingLot.currentOccupancy++;
                            }
                            this.shouldRemove = true;
                            return;
                        }

                        // Parked
                        this.state = 'PARKING_WAIT';

                        // SPAWN GUESTS FROM VEHICLE (only once, immediately when parking)
                        // WICHTIG: kein timer===0-Check — der Fahr-Timer kann beim
                        // Einparken != 0 sein, dann stiegen nie Gäste aus.
                        if (!this.hasSpawnedGuests) {
                            this.hasSpawnedGuests = true;
                            this.waitingPassengers = 0;

                            const guestCount = this.type === 'bus' ? 20 : 4;

                            // Spawn guests
                            for (let i = 0; i < guestCount; i++) {
                                const guest = new Guest(manager.nextGuestId++, this, manager);

                                // Position around vehicle (spread out more for buses)
                                if (this.type === 'bus') {
                                    guest.x = this.x + ((i % 5) - 2) * 0.6;
                                    guest.y = this.y + (Math.floor(i / 5) - 1) * 0.6;
                                } else {
                                    guest.x = this.x + ((i % 2) - 0.5) * 0.8;
                                    guest.y = this.y + (Math.floor(i / 2) - 0.5) * 0.8;
                                }

                                // Guests will automatically find ticket office in their update()
                                manager.guests.push(guest);
                                this.waitingPassengers++;
                            }
                        }

                        // SPAWN FROM PARKING GARAGE
                        if (this.parkingLot && this.parkingLot.type.id === 'parking_garage' && this.type === 'car' && !this.hasSpawnedFromGarage) {
                            this.hasSpawnedFromGarage = true;

                            // Spawn 4 guests from garage exit
                            for (let i = 0; i < 4; i++) {
                                const guest = new Guest(manager.nextGuestId++, this, manager);

                                // Position at garage exit
                                guest.x = this.parkingLot.x + this.parkingLot.type.size.width / 2 + ((i % 2) - 0.5) * 0.8;
                                guest.y = this.parkingLot.y + this.parkingLot.type.size.height + 1 + (Math.floor(i / 2) - 0.5) * 0.8;

                                manager.guests.push(guest);
                                this.waitingPassengers++;
                            }
                        }

                        this.timer = 0;

                        // FEE
                        if (this.type === 'car') {
                            const fee = this.parkingLot.customPrice !== undefined && this.parkingLot.customPrice !== null
                                ? this.parkingLot.customPrice
                                : (this.parkingLot.type.basePrice || 8);
                            manager.earn(fee, 'parking');
                            // Autos parken 1–2 Spieltage und fahren dann wieder ab —
                            // so werden Stellplätze für neue Gäste frei.
                            this.maxWait = 240 + Math.random() * 280;
                        } else {
                            this.maxWait = 60; // 60s for Bus
                        }

                        // ALIGNMENT
                        let baseRot = 90;
                        if (this.parkingLot) {
                            const lRot = this.parkingLot.rotation || 0;
                            const lRad = (lRot * Math.PI) / 180;
                            this.rotation = lRad + (Math.PI / 2);
                        }
                    } else {
                        // PARKING_EXIT Complete -> Merge to Road
                        const neighbors = manager.getRoadNeighbors(this.currentTile.x, this.currentTile.y, gridSize);
                        if (neighbors > 0) {
                            this.state = 'FINDING_EXIT'; // Leave World
                            this.startPos = { x: this.x, y: this.y };
                            // Pick a valid direction
                            let newDir = { x: 1, y: 0 };
                            if (neighbors & 1) newDir = { x: 0, y: -1 }; // N
                            else if (neighbors & 2) newDir = { x: 1, y: 0 }; // E
                            else if (neighbors & 4) newDir = { x: 0, y: 1 }; // S
                            else if (neighbors & 8) newDir = { x: -1, y: 0 }; // W

                            this.dir = newDir;
                            this.nextTile = { x: Math.round(this.x + this.dir.x), y: Math.round(this.y + this.dir.y) };
                            this.updateTargetAndMode(false);
                        } else {
                            // No road found? Despawn
                            this.shouldRemove = true;
                        }
                    }
                } else {
                    // NEXT WAYPOINT (Standard Move)
                    this.startPos = { x: this.x, y: this.y };
                    this.nextTile = path[this.pathIndex];
                    if (!this.isAllowedVehicleSurface(manager, this.nextTile.x, this.nextTile.y)) {
                        this.shouldRemove = true;
                        return true;
                    }
                    this.targetPos = { x: this.nextTile.x + 0.5, y: this.nextTile.y + 0.5 };

                    const dx = this.targetPos.x - this.startPos.x;
                    const dy = this.targetPos.y - this.startPos.y;
                    this.duration = Math.sqrt(dx * dx + dy * dy) / (this.speed * 0.5);
                    this.progress = 0;

                    if (this.duration < 0.1) this.duration = 0.1;

                    const angle = Math.atan2(dy, dx);
                    this.rotation = angle;
                    this.dir = { x: Math.sign(dx) || 0, y: Math.sign(dy) || 0 };
                }
            }
        } else if (this.state === 'PARKING_WAIT') {
            // Force Bus Alignment
            if (this.type === 'bus') this.rotation = Math.PI / 2;

            if (this.requestDeparture && (this.waitingPassengers || 0) <= 0) {
                this.timer = this.maxWait;
            }
            this.timer += dtSec;
            if (this.timer >= this.maxWait) {
                this.state = 'PARKING_EXIT';

                // Decrement Occupancy for Bus Stop too
                if (this.parkingLot && this.parkingLot.type.id === 'bus_stop') {
                    if (this.parkingLot.currentOccupancy > 0) this.parkingLot.currentOccupancy--;
                }

                // Determine Exit Path
                if (this.parkingLot && this.parkingLot.type.id === 'bus_stop') {
                    this.exitPath = [...this.parkingPath].reverse();
                    this.exitPath.shift();

                    // Ensure Exit leads to ROAD (not just building entry)
                    // Bus Stop entry is {x: midX, y: 0} of local.
                    // Map to World Neighbor
                    if (this.exitPath.length > 0) {
                        const last = this.exitPath[this.exitPath.length - 1];
                        // Check if 'last' is road.
                        if (!manager._hasRoadAt(last.x, last.y)) {
                            // Find nearest road neighbor to 'last'
                            const neighbors = [
                                { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
                            ];
                            const roadTile = neighbors.map(n => ({ x: last.x + n.x, y: last.y + n.y }))
                                .find(t => manager._hasRoadAt(t.x, t.y));

                            if (roadTile) {
                                this.exitPath.push(roadTile);
                            }
                        }
                    }
                } else {
                    // Reverse out (Car)
                    // Use validEntry if available (stored on entering?), or recalculate?
                    // Simplified: Exit to the same point we entered from (to ensure Road contact)
                    // Or scan for road neighbor near Aisle 4?
                    const lot = this.parkingLot;
                    const toWorld = (lx, ly) => {
                        let wx = lx; let wy = ly;
                        if (lot.rotation === 90) { wx = 7 - ly; wy = lx; }
                        else if (lot.rotation === 180) { wx = 7 - lx; wy = 7 - ly; }
                        else if (lot.rotation === 270) { wx = ly; wy = 7 - lx; }
                        return { x: lot.x + wx, y: lot.y + wy };
                    };
                    const pAisle = toWorld(4, this.parkingSpot.ly);

                    // Try Aisle 4 Exit (Standard)
                    let pExit = toWorld(4, 0);

                    // If pExit is NOT road, try Aisle 3 (Entrance side) which is likely road
                    if (!manager._hasRoadAt(pExit.x, pExit.y)) {
                        const pExit3 = toWorld(3, 0);
                        if (manager._hasRoadAt(pExit3.x, pExit3.y)) {
                            pExit = pExit3;
                        } else {
                            // Search 3x3 at exit for ANY road
                            const neighbors = [
                                { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
                            ];
                            const roadTile = neighbors.map(n => ({ x: pExit.x + n.x, y: pExit.y + n.y }))
                                .find(t => manager._hasRoadAt(t.x, t.y));
                            if (roadTile) pExit = roadTile;
                        }
                    }

                    this.exitPath = [pAisle, pExit];

                    // Decrement Occupancy
                    if (this.parkingLot.currentOccupancy > 0) this.parkingLot.currentOccupancy--;
                }

                this.pathIndex = 0;
                if (this.exitPath.length > 0) {
                    this.startPos = { x: this.x, y: this.y };
                    this.nextTile = this.exitPath[0];
                    this.targetPos = { x: this.nextTile.x + 0.5, y: this.nextTile.y + 0.5 };
                    const dx = this.targetPos.x - this.startPos.x;
                    const dy = this.targetPos.y - this.startPos.y;
                    this.duration = Math.sqrt(dx * dx + dy * dy) / (this.speed * 0.5);
                    this.progress = 0;
                }
            }
        } else if (this.state === 'U_TURN') {
            this.timer += dtSec;
            const turnDuration = 1.5;
            this.rotation += (Math.PI / turnDuration) * dtSec;

            const getLanePos = (tx, ty, dx, dy) => {
                const cx = tx + 0.5; const cy = ty + 0.5;
                const perpX = -dy; const perpY = dx;
                const hasRightRoad = manager._hasRoadAt(tx + perpX, ty + perpY);
                if (hasRightRoad) return { x: (tx + perpX) + 0.5, y: (ty + perpY) + 0.5 };
                return { x: cx, y: cy };
            };

            const target = getLanePos(this.currentTile.x, this.currentTile.y, this.dir.x, this.dir.y);
            const dx = target.x - this.x; const dy = target.y - this.y;
            this.x += dx * 2.0 * dtSec; this.y += dy * 2.0 * dtSec;

            if (this.timer >= turnDuration) {
                this.state = 'DRIVING';
                this.timer = 0;
                this.dir = { x: -this.dir.x, y: -this.dir.y };

                // CRITICAL: After U-Turn, position vehicle on RIGHT side of road
                this.currentTile = { x: Math.round(this.x), y: Math.round(this.y) };
                this.nextTile = { x: this.currentTile.x + this.dir.x, y: this.currentTile.y + this.dir.y };

                // Use getLanePos to ensure right-hand traffic
                this.startPos = getLanePos(this.currentTile.x, this.currentTile.y, this.dir.x, this.dir.y);
                this.x = this.startPos.x;
                this.y = this.startPos.y;

                this.moveMode = 'LINEAR';
                this.targetPos = getLanePos(this.nextTile.x, this.nextTile.y, this.dir.x, this.dir.y);
                const ddx = this.targetPos.x - this.startPos.x;
                const ddy = this.targetPos.y - this.startPos.y;
                this.duration = Math.sqrt(ddx * ddx + ddy * ddy) / this.speed;
                this.progress = 0;
            }
        }
    }

}

export class Lift {
    constructor(id, type, startTile, endTile) {
        this.id = id;
        this.type = type; // e.g., 'CHAIR_4'
        this.startTile = startTile; // {x, y, z}
        this.endTile = endTile; // {x, y, z}
        this.status = 'operational';
        this.passengers = [];
        this.capacity = type.capacity || 1;
        this.speed = type.speed || 1;
        this.speedMultiplier = 1;
        this.progress = 0; // 0 to 1 for the groups moving
    }

    update(deltaTime) {
        if (this.status !== 'operational') return;

        // Move "groups" (chairs/gondolas) along the cable
        // This is simplified for now
        this.progress += (deltaTime / 10000) * this.speed;
        if (this.progress > 1) this.progress = 0;
    }
}

/**
 * Pistenbully (Snow Groomer) Class
 * Handles movement along pistes and between locations.
 */
// Pathfinding Helper using A* (Manhattan for Grid)
const findPath = (sx, sy, tx, ty, heightmap, gridSize) => {
    // Simple direct path for now if A* is too heavy for JS
    // Or just direct line interpolation?
    // "Intelligently drive" implies avoiding obstacles (Cliffs, Trees, Buildings).
    // For MVP, allow "Ghosting" through terrain but try to follow terrain height?
    // User requested "suchen sich selbstständig den Weg".
    // - [x] Create implementation plan
    // - [x] Implement occlusion logic for Pistenbully when in garage
    // - [x] Fix garage door positioning for clearer entry/exit
    // - [ ] Verify changes in-game [/]
    // request, "Pathfinding: Implement logic to find nearest piste".
    // I will stick to direct line for "to_piste" state logic initially to ensure it works, then refine.
    // DEBUG: If finding path fails, return trivial path to (10,10) to prove movement
    return [{ x: 10, y: 10 }, { x: 11, y: 11 }, { x: 12, y: 12 }];
};

/**
 * Pistenbully (Snow Groomer) Class
 * Handles movement, grooming cycle, and state.
 */
export class Pistenbully {
    constructor(id, garage) {
        this.id = id;
        this.garage = garage;
        // Start AT garage location
        this.x = garage.x + garage.type.size.width / 2;
        this.y = garage.y + garage.type.size.height / 2;
        this.z = 0;
        this.rotation = 0;

        // State Machine
        this.state = 'GARAGE'; // GARAGE, DRIVING, GROOMING, RETURNING
        this.targetX = this.x;
        this.targetY = this.y;

        // Timers (in seconds)
        this.workTimer = 0;
        this.restTimer = 300; // Start fully rested (ready to work)

        // Configuration
        this.WORK_DURATION = 15 * 60; // 15 mins
        this.REST_DURATION = 10;      // 10 seconds (Quick turnaround)

        this.assignedPiste = null;
        this.path = [];
        this.speed = 4.0; // Tiles per second (Speed up for visibility? 4m/s = 14km/h)
        // Scale dependent. If 1 tile = 20m. 4 tiles/s = 80m/s = 288km/h!! Too fast.
        // Real speed ~15km/h = 4m/s.
        // 1 tile = 20m. So 0.2 tiles/s.
        this.speedTilesPerSec = 1.5; // Slightly increased for better gameplay pacing (was 1.0)
        // 15km/h = 4.16 m/s.
        // Tile = 20m.
        // Speed = 0.208 tiles/s.
        // Let's go with 0.5 tiles/s (~36km/h) for gameplay pacing.

        this.flashingLight = 0;
        this.groomingIndex = 0;
    }

    update(dt, manager, gridSize, heightmap, landcover) {
        // dt is in milliseconds
        const dtSec = dt / 1000;
        this.flashingLight += dtSec * 5;

        // Update Z height always (Bilinear Interpolation for smooth movement)
        const x0 = Math.floor(Math.max(0, Math.min(gridSize - 1, this.x)));
        const y0 = Math.floor(Math.max(0, Math.min(gridSize - 1, this.y)));
        const x1 = Math.min(gridSize - 1, x0 + 1);
        const y1 = Math.min(gridSize - 1, y0 + 1);
        const tx = this.x - x0;
        const ty = this.y - y0;

        const h00 = heightmap[y0 * gridSize + x0] || 0;
        const h10 = heightmap[y0 * gridSize + x1] || 0;
        const h01 = heightmap[y1 * gridSize + x0] || 0;
        const h11 = heightmap[y1 * gridSize + x1] || 0;

        const h0 = h00 * (1 - tx) + h10 * tx;
        const h1 = h01 * (1 - tx) + h11 * tx;
        this.z = h0 * (1 - ty) + h1 * ty;



        switch (this.state) {
            case 'GARAGE':
                this.restTimer += dtSec;
                if (this.restTimer >= this.REST_DURATION) {
                    this.startShift(manager, gridSize, heightmap, landcover);
                }
                break;

            case 'DRIVING':
                this.move(dtSec, gridSize);
                if (this.hasReachedTarget()) {
                    if (this.path.length > 0) {
                        const next = this.path.shift();
                        this.targetX = next.x;
                        this.targetY = next.y;
                    } else if (this.assignedPiste) {
                        this.state = 'GROOMING';
                        // Start from the LAST segment (bottom of piste) to groom uphill
                        this.groomingIndex = this.assignedPiste.segments.length - 1;
                        this.targetX = Math.floor(this.assignedPiste.segments[this.groomingIndex].x) + 0.5;
                        this.targetY = Math.floor(this.assignedPiste.segments[this.groomingIndex].y) + 0.5;

                    } else {
                        this.returnToGarage(manager, gridSize, heightmap, landcover);
                    }
                }
                // Recalculate if path blocked? (Expensive, maybe just wait)
                break;

            case 'GROOMING':
                this.workTimer += dtSec;
                this.move(dtSec, gridSize);

                if (this.hasReachedTarget()) {
                    // Mark current segment as groomed (progressive grooming effect)
                    if (this.assignedPiste && this.assignedPiste.segmentConditions && this.groomingIndex >= 0) {
                        this.assignedPiste.segmentConditions[this.groomingIndex] = 1.0;
                    }

                    // Move UPHILL (decrement index to go from bottom to top)
                    this.groomingIndex--;
                    if (this.groomingIndex >= 0) {
                        this.targetX = Math.floor(this.assignedPiste.segments[this.groomingIndex].x) + 0.5;
                        this.targetY = Math.floor(this.assignedPiste.segments[this.groomingIndex].y) + 0.5;
                    } else {
                        // Finished Piste (reached the top)


                        // Mark piste as finished
                        if (this.assignedPiste) {
                            this.assignedPiste.needsGrooming = false;
                            this.assignedPiste.isBeingGroomed = false;
                            this.assignedPiste.condition = 1.0; // Reset to 100%
                        }

                        if (this.workTimer >= this.WORK_DURATION) {
                            this.returnToGarage(manager, gridSize, heightmap, landcover);
                        } else {
                            // Find another piste
                            this.findNextPiste(manager, gridSize, heightmap, landcover);
                        }
                    }
                }
                break;

            case 'RETURNING':
                this.move(dtSec, gridSize);
                if (this.hasReachedTarget()) {
                    if (this.path.length > 0) {
                        const next = this.path.shift();
                        this.targetX = next.x;
                        this.targetY = next.y;
                    } else {
                        // Arrived at Garage
                        this.state = 'GARAGE';
                        this.restTimer = 0;
                        this.rotation = Math.PI; // Face the door (South)
                        this.x = this.targetX;   // Ensure exact alignment
                        this.y = this.targetY;
                    }
                }
                break;
        }
    }

    startShift(manager, gridSize, heightmap, landcover) {
        this.workTimer = 0;
        this.findNextPiste(manager, gridSize, heightmap, landcover);
    }

    findNextPiste(manager, gridSize, heightmap, landcover) {


        if (manager.pistes.length === 0) {

            this.state = 'GARAGE';
            this.restTimer = 0;
            return;
        }

        // 1. Find nearest UNGROOMED piste
        let bestPiste = null;
        let bestDist = Infinity;

        // Filter for work: needs grooming and not currently being groomed by someone else
        const availablePistes = manager.pistes.filter(p => p.needsGrooming && !p.isBeingGroomed);

        if (availablePistes.length === 0) {

            this.returnToGarage(manager, gridSize, heightmap, landcover);
            return;
        }

        availablePistes.forEach(p => {
            // Distance to BOTTOM of piste (last segment) since we start grooming from bottom
            const bottom = p.segments[p.segments.length - 1];
            const dist = Math.abs(bottom.x - this.x) + Math.abs(bottom.y - this.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestPiste = p;
            }
        });

        this.assignedPiste = bestPiste || availablePistes[0];
        this.assignedPiste.isBeingGroomed = true; // Reserve it


        if (!this.assignedPiste.segments || this.assignedPiste.segments.length === 0) {

            this.state = 'GARAGE';
            this.restTimer = 0;
            return;
        }

        // 2. Compute Path to BOTTOM of Piste (last segment)
        const bottomNode = this.assignedPiste.segments[this.assignedPiste.segments.length - 1];
        const path = manager.findPath(this.x, this.y, bottomNode.x, bottomNode.y, heightmap, gridSize, landcover, this.garage);

        if (path.length > 0) {
            this.path = path;
            const next = this.path.shift();
            this.targetX = next.x;
            this.targetY = next.y;
        } else {
            // Path failed? Fallback to DIRECT LINE (ensure center of tile)
            this.path = [];
            this.targetX = Math.floor(bottomNode.x) + 0.5;
            this.targetY = Math.floor(bottomNode.y) + 0.5;
        }
        // Always switch to DRIVING if we have a piste
        this.state = 'DRIVING';

    }

    returnToGarage(manager, gridSize, heightmap, landcover) {
        this.state = 'RETURNING';
        this.assignedPiste = null;

        // Park deeper inside to be fully occluded
        const endX = this.garage.x + this.garage.type.size.width / 2;
        const endY = this.garage.y + this.garage.type.size.height * 0.7; // Deeper than center (South is bottom)

        const path = manager.findPath(this.x, this.y, endX, endY, heightmap, gridSize, landcover, this.garage);

        if (path.length > 0) {
            this.path = path;
            const next = this.path.shift();
            this.targetX = next.x;
            this.targetY = next.y;
        } else {
            // Emergency: Teleport home if stuck returning?
            // Or just drive direct.
            this.targetX = endX;
            this.targetY = endY;
            this.path = [];
        }
    }

    move(dtSec, gridSize) {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01) {
            const step = this.speedTilesPerSec * dtSec;
            if (step >= dist) {
                this.x = this.targetX;
                this.y = this.targetY;
            } else {
                this.x += (dx / dist) * step;
                this.y += (dy / dist) * step;
                // Smooth rotation
                const targetRot = Math.atan2(dy, dx);
                // Simple lerp rotation
                let rotDiff = targetRot - this.rotation;
                // Normalize to -PI..PI
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

                this.rotation += rotDiff * 5 * dtSec;
            }
        } else {
            // Snap to target to ensure hasReachedTarget returns true
            this.x = this.targetX;
            this.y = this.targetY;
        }
    }

    hasReachedTarget() {
        const dist = Math.sqrt((this.x - this.targetX) ** 2 + (this.y - this.targetY) ** 2);
        return dist < 0.05; // Reduced from 0.2 for smoother path following
    }
}

// ===============================================
// SKI-DOO PATROL VEHICLE
// ===============================================
export class SkiDoo {
    constructor(id, station) {
        this.id = id;
        this.station = station;
        // Start AT station location
        this.x = station.x + station.type.size.width / 2;
        this.y = station.y + station.type.size.height / 2;
        this.z = 0;
        this.rotation = 0;

        // State Machine
        this.state = 'IDLE'; // IDLE, DRIVING, PATROLLING, RETURNING
        this.targetX = this.x;
        this.targetY = this.y;

        // Configuration  
        this.assignedPiste = null;
        this.path = [];
        this.patrolIndex = 0;
        this.speedTilesPerSec = 1.5; // Adjusted as requested
        this.flashingLight = 0;
        this.idleTimer = 0;
        this.IDLE_DURATION = 30; // 30 seconds at station between patrols

        // Sled (Akja) State - Physics based trailing
        this.sledX = this.x - 0.8; // Start behind
        this.sledY = this.y;
        this.sledZ = 0;
        this.sledRotation = 0;
    }

    update(dt, manager, gridSize, heightmap, landcover) {
        const dtSec = dt / 1000;
        this.flashingLight += dtSec * 8; // Faster flashing for emergency vehicle

        // Update Z height (Bilinear Interpolation)
        const getZ = (wx, wy) => {
            const x0 = Math.floor(Math.max(0, Math.min(gridSize - 1, wx)));
            const y0 = Math.floor(Math.max(0, Math.min(gridSize - 1, wy)));
            const x1 = Math.min(gridSize - 1, x0 + 1);
            const y1 = Math.min(gridSize - 1, y0 + 1);
            const tx = wx - x0;
            const ty = wy - y0;

            const h00 = heightmap[y0 * gridSize + x0] || 0;
            const h10 = heightmap[y0 * gridSize + x1] || 0;
            const h01 = heightmap[y1 * gridSize + x0] || 0;
            const h11 = heightmap[y1 * gridSize + x1] || 0;

            const h0 = h00 * (1 - tx) + h10 * tx;
            const h1 = h01 * (1 - tx) + h11 * tx;
            return h0 * (1 - ty) + h1 * ty;
        };

        this.z = getZ(this.x, this.y);

        switch (this.state) {
            case 'IDLE':
                this.idleTimer += dtSec;
                if (this.idleTimer >= this.IDLE_DURATION) {
                    this.startPatrol(manager, gridSize, heightmap, landcover);
                }
                break;

            case 'DRIVING':
                this.move(dtSec, gridSize);
                if (this.hasReachedTarget()) {
                    if (this.path.length > 0) {
                        const next = this.path.shift();
                        this.targetX = next.x;
                        this.targetY = next.y;
                    } else if (this.assignedPiste) {
                        // Start Patrolling from bottom
                        this.state = 'PATROLLING';
                        // Initialize Index at end of segments (bottom)
                        this.patrolIndex = this.assignedPiste.segments.length - 2; // Move to next point up
                        if (this.patrolIndex >= 0) {
                            const next = this.assignedPiste.segments[this.patrolIndex];
                            this.targetX = next.x;
                            this.targetY = next.y;
                        }
                    } else {
                        // Returned to station?
                        this.state = 'IDLE';
                        this.assignedPiste = null;
                        this.targetX = this.station.x + this.station.type.size.width / 2;
                        this.targetY = this.station.y + this.station.type.size.height / 2;
                    }
                }
                break;

            case 'PATROLLING':
                this.move(dtSec, gridSize);
                if (this.hasReachedTarget()) {
                    this.patrolIndex--;
                    if (this.patrolIndex >= 0) {
                        const next = this.assignedPiste.segments[this.patrolIndex];
                        this.targetX = next.x;
                        this.targetY = next.y;
                    } else {
                        // Finished patrol, return
                        this.state = 'RETURNING';
                        this.targetX = this.station.x + this.station.type.size.width / 2;
                        this.targetY = this.station.y + this.station.type.size.height / 2;
                    }
                }
                break;

            case 'RETURNING':
                this.move(dtSec, gridSize);
                if (this.hasReachedTarget()) {
                    this.state = 'IDLE';
                    this.idleTimer = 0;
                    this.assignedPiste = null;
                }
                break;
        }

        // --- SLED PHYSICS UPDATE ---
        // --- SLED PHYSICS UPDATE ---
        // 2. Rigid Attachment (User Request: "Genau hinten dran in einer Flucht")
        // Instead of a loose tow bar, we lock the sled to the Ski-Doo's frame.
        // User wants it "stricter" -> closer
        const totalOffset = 1.0; // Reduced from 1.3
        this.sledRotation = this.rotation; // Lock rotation perfectly parallel

        this.sledX = this.x - Math.cos(this.rotation) * totalOffset;
        this.sledY = this.y - Math.sin(this.rotation) * totalOffset;

        // 3. Independent Z Height for Sled (Anti-Clipping MAX Z)
        // Sample height at Center, Front, and Rear to prevent burying
        const z0 = getZ(this.sledX, this.sledY);
        // Front probe (toward hitch)
        const zF = getZ(this.sledX + Math.cos(this.sledRotation) * 0.6, this.sledY + Math.sin(this.sledRotation) * 0.6);
        // Rear probe (away from hitch)
        const zR = getZ(this.sledX - Math.cos(this.sledRotation) * 0.6, this.sledY - Math.sin(this.sledRotation) * 0.6);

        // Use MAX height + 0.4 clearance
        this.sledZ = Math.max(z0, zF, zR) + 0.4;
    }




    startPatrol(manager, gridSize, heightmap, landcover) {
        // Find a random piste to patrol
        const availablePistes = manager.pistes.filter(p => p.segments && p.segments.length > 0);

        if (availablePistes.length === 0) {
            this.idleTimer = 0; // Wait longer
            return;
        }

        // Pick random piste
        this.assignedPiste = availablePistes[Math.floor(Math.random() * availablePistes.length)];

        // Navigate to bottom of piste
        const bottomSegment = this.assignedPiste.segments[this.assignedPiste.segments.length - 1];
        const targetX = Math.floor(bottomSegment.x) + 0.5;
        const targetY = Math.floor(bottomSegment.y) + 0.5;

        this.path = this.findPath(gridSize, heightmap, landcover, targetX, targetY);

        if (this.path.length > 0) {
            this.state = 'DRIVING';
            const next = this.path.shift();
            this.targetX = next.x;
            this.targetY = next.y;
        }
    }

    returnToStation(manager, gridSize, heightmap, landcover) {
        const stationX = this.station.x + this.station.type.size.width / 2;
        const stationY = this.station.y + this.station.type.size.height / 2;

        this.path = this.findPath(gridSize, heightmap, landcover, stationX, stationY);

        if (this.path.length > 0) {
            this.state = 'RETURNING';
            const next = this.path.shift();
            this.targetX = next.x;
            this.targetY = next.y;
        }
    }

    findPath(gridSize, heightmap, landcover, targetX, targetY) {
        // Simple direct path for now
        return [{ x: targetX, y: targetY }];
    }

    move(dtSec, gridSize) {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.01) {
            const step = this.speedTilesPerSec * dtSec;
            if (step >= dist) {
                this.x = this.targetX;
                this.y = this.targetY;
            } else {
                this.x += (dx / dist) * step;
                this.y += (dy / dist) * step;

                // Smooth rotation (like Pistenbully)
                const targetRot = Math.atan2(dy, dx);
                let rotDiff = targetRot - this.rotation;
                // Normalize to -PI..PI
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;

                this.rotation += rotDiff * 5 * dtSec;
            }
        } else {
            this.x = this.targetX;
            this.y = this.targetY;
        }
    }

    hasReachedTarget() {
        const dist = Math.sqrt((this.x - this.targetX) ** 2 + (this.y - this.targetY) ** 2);
        return dist < 0.05;
    }
}

export class SkiResortManager {
    constructor() {
        this.lifts = [];
        this.pistes = [];
        this.nextPisteId = 1;
        this.pistes = [];
        this.buildings = [];
        this.vehicles = []; // Generic vehicles
        this.pistenbullies = []; // Specific Pistenbully instances
        this.skidoos = []; // Medical patrol Ski-Doos
        this.helicopters = []; // Rescue Helicopters
        this.money = 150000; // Starting capital — enough for a basic resort (ticket office + lift + piste + toilet + one hut), then grow from revenue

        // Ski Pass System
        this.baseSkiPassPrice = 85;      // Base price for day pass
        this.customSkiPassPrice = null;  // null = use base price
        this.skiPassSales = 0;           // Number of passes sold
        this.dailySkiPassRevenue = 0;    // Revenue from ski passes
        this.skiPassSalesToday = 0;
        this.skiPassRevenueToday = 0;
        this.gastroRevenueToday = 0;
        this.hotelRevenueToday = 0;
        this.traffic = [];
        this.trafficTimer = 0;
        this.liftBoardingStats = new Map(); // liftId -> { boardings, totalWaitSec }
        this.totalEnergyUsage = 0;

        // Guest System
        this.guests = [];
        this.nextGuestId = 1;
        this.currentTime = 0; // Game time in seconds
        this.dayNumber = 1;
        this.dayDurationSec = 5 * 60;
        this.duskDurationSec = 5;

        // ===== UNIFIED ECONOMY (single source of truth) =====
        // ALL money mutations must go through earn() / spend().
        this.totalRevenue = 0;        // Lifetime revenue (missions)
        this.totalExpenses = 0;       // Lifetime expenses
        this.totalGuestsServed = 0;   // Lifetime paid guests (missions)
        this.parkingRevenueToday = 0;
    }

    /**
     * UNIFIED ECONOMY: add revenue. Always use this instead of `money +=`.
     * @param {number} amount
     * @param {string} category - 'skipass' | 'gastro' | 'hotel' | 'parking' | 'sale' | 'other'
     */
    earn(amount, category = 'other') {
        const v = Math.max(0, Math.round(amount || 0));
        if (v <= 0) return 0;
        this.money += v;
        if (category !== 'sale') this.totalRevenue += v;
        if (category === 'skipass') this.skiPassRevenueToday = (this.skiPassRevenueToday || 0) + v;
        else if (category === 'gastro') this.gastroRevenueToday = (this.gastroRevenueToday || 0) + v;
        else if (category === 'hotel') this.hotelRevenueToday = (this.hotelRevenueToday || 0) + v;
        else if (category === 'parking') this.parkingRevenueToday = (this.parkingRevenueToday || 0) + v;
        return v;
    }

    /**
     * UNIFIED ECONOMY: spend money. Returns false (and spends nothing) if
     * the balance is insufficient — eliminates negative-balance payment bugs.
     * @param {number} amount
     * @param {boolean} force - allow balance to go negative (daily operating costs)
     */
    spend(amount, force = false) {
        const v = Math.max(0, Math.round(amount || 0));
        if (v <= 0) return true;
        if (!force && this.money < v) return false;
        this.money -= v;
        this.totalExpenses += v;
        return true;
    }

    canAfford(amount) {
        return this.money >= Math.max(0, Math.round(amount || 0));
    }

    // ============================================================
    // POI-SYSTEM: Markante Punkte auf der Karte (Gipfelkreuz,
    // Talkreuz, Bergsee-Panorama). Missionen verlangen, dass eine
    // bestimmte Zahl von Gästen in den Radius dieser Punkte kommt —
    // das belohnt weiträumige Erschließung des Geländes.
    // ============================================================
    initPois(heightmap, gridSize, landcover) {
        this.pois = [];
        if (!heightmap || !gridSize) return;

        const startX = 10, startY = 10;
        const dist2 = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

        // 1. GIPFELKREUZ — höchster Punkt der Karte
        let maxH = -Infinity, sx = 0, sy = 0;
        for (let y = 2; y < gridSize - 2; y++) {
            for (let x = 2; x < gridSize - 2; x++) {
                const h = heightmap[y * gridSize + x];
                if (h > maxH) { maxH = h; sx = x; sy = y; }
            }
        }
        this.pois.push({
            id: 'summit', name: 'Gipfelkreuz', x: sx, y: sy, z: maxH,
            radius: 8, visitors: new Set()
        });

        // 2. TALKREUZ — tiefe Lage, möglichst weit von Start UND Gipfel entfernt
        let bestScore = -Infinity, vx = 0, vy = 0, vz = 0;
        const hRange = maxH || 1;
        for (let y = 6; y < gridSize - 6; y += 2) {
            for (let x = 6; x < gridSize - 6; x += 2) {
                const idx = y * gridSize + x;
                const h = heightmap[idx];
                if (h > hRange * 0.35) continue;         // nur Tallagen
                if (landcover && landcover[idx] === 2) continue; // kein Wasser
                if (dist2(x, y, startX, startY) < 70 * 70) continue; // weit weg vom Start
                const score = Math.sqrt(dist2(x, y, startX, startY)) + Math.sqrt(dist2(x, y, sx, sy)) * 0.6;
                if (score > bestScore) { bestScore = score; vx = x; vy = y; vz = h; }
            }
        }
        if (bestScore > -Infinity) {
            this.pois.push({
                id: 'valley', name: 'Talkreuz', x: vx, y: vy, z: vz,
                radius: 9, visitors: new Set()
            });
        }

        // 3. BERGSEE-PANORAMA — Ufer eines Sees/Flusses, weit vom Start
        let lakeScore = -Infinity, lx = -1, ly = -1, lz = 0;
        for (let y = 4; y < gridSize - 4; y += 2) {
            for (let x = 4; x < gridSize - 4; x += 2) {
                const idx = y * gridSize + x;
                if (!landcover || landcover[idx] === 2) continue;
                // Ufer: Nachbar ist Wasser
                const nearWater = landcover[idx - 1] === 2 || landcover[idx + 1] === 2 ||
                    landcover[idx - gridSize] === 2 || landcover[idx + gridSize] === 2;
                if (!nearWater) continue;
                const d = Math.sqrt(dist2(x, y, startX, startY));
                if (d < 50) continue;
                if (d > lakeScore) { lakeScore = d; lx = x; ly = y; lz = heightmap[idx]; }
            }
        }
        if (lx >= 0) {
            this.pois.push({
                id: 'lake', name: 'Bergsee-Panorama', x: lx, y: ly, z: lz,
                radius: 9, visitors: new Set()
            });
        }

        // 4. AUSSICHTSPUNKTE auf Nebengipfeln — mehr markante Orte,
        // die zum weiträumigen Erschließen einladen (ohne Missionszwang)
        const taken = this.pois.map(p => ({ x: p.x, y: p.y }));
        let vistaNum = 0;
        const candidates = [];
        for (let y = 8; y < gridSize - 8; y += 4) {
            for (let x = 8; x < gridSize - 8; x += 4) {
                const h = heightmap[y * gridSize + x];
                if (h < hRange * 0.5) continue;
                candidates.push({ x, y, h });
            }
        }
        candidates.sort((a, b) => b.h - a.h);
        for (const c of candidates) {
            if (vistaNum >= 2) break;
            const farEnough = taken.every(t => dist2(c.x, c.y, t.x, t.y) > (gridSize * 0.2) ** 2);
            if (!farEnough) continue;
            vistaNum++;
            taken.push({ x: c.x, y: c.y });
            this.pois.push({
                id: `vista${vistaNum}`, name: 'Aussichtspunkt', x: c.x, y: c.y, z: c.h,
                radius: 7, visitors: new Set()
            });
        }

        this._poiTimer = 0;
    }

    /** Alle ~2 s: zahlende Gäste im POI-Radius als Besucher zählen. */
    updatePoiVisitors(dtSec) {
        if (!this.pois || this.pois.length === 0) return;
        this._poiTimer = (this._poiTimer || 0) + dtSec;
        if (this._poiTimer < 2) return;
        this._poiTimer = 0;

        // FUNPARK-AURA: Gäste in der Nähe eines Funparks bekommen Stimmung
        const funparks = (this.buildings || []).filter(b => b.type?.isFunPark);
        for (const fp of funparks) fp.currentOccupancy = 0;

        for (const guest of this.guests || []) {
            if (!guest || guest.shouldRemove || !guest.hasLiftPass) continue;
            for (const poi of this.pois) {
                const dx = (guest.x || 0) - poi.x;
                const dy = (guest.y || 0) - poi.y;
                if (dx * dx + dy * dy <= poi.radius * poi.radius) {
                    poi.visitors.add(guest.id);
                }
            }
            for (const fp of funparks) {
                const cx = fp.x + (fp.type.size?.width || 6) / 2;
                const cy = fp.y + (fp.type.size?.height || 10) / 2;
                const dx = (guest.x || 0) - cx;
                const dy = (guest.y || 0) - cy;
                if (dx * dx + dy * dy <= 12 * 12) {
                    guest.satisfaction = Math.min(100, (guest.satisfaction || 50) + 0.9);
                    fp.currentOccupancy = (fp.currentOccupancy || 0) + 1;
                }
            }
        }
    }

    getPoiVisitorCount(poiId) {
        const poi = (this.pois || []).find(p => p.id === poiId);
        return poi ? poi.visitors.size : 0;
    }

    /** Piste kilometres split by difficulty — used by the mission system. */
    getPisteStats() {
        const stats = { totalKm: 0, blueKm: 0, redKm: 0, blackKm: 0, count: this.pistes.length };
        for (const p of this.pistes) {
            const km = (p.length || 0) / 1000;
            stats.totalKm += km;
            const d = p.avgDifficulty || 'BLUE';
            if (d === 'BLUE') stats.blueKm += km;
            else if (d === 'RED') stats.redKm += km;
            else stats.blackKm += km;
        }
        return stats;
    }

    /** Snapshot of all mission-relevant metrics. */
    getMissionStats() {
        const piste = this.getPisteStats();
        const buildings = this.buildings || [];
        const hotelBeds = buildings
            .filter(b => b.type?.category === 'hotel')
            .reduce((sum, b) => sum + Math.max(0, b.type?.capacity || 0), 0);
        const gastroCount = buildings.filter(b => b.type?.category === 'gastronomy').length;
        const shopCount = buildings.filter(b => b.type?.category === 'shop').length;
        const maxLiftCapacity = (this.lifts || []).reduce((m, l) => Math.max(m, l.type?.capacity || 0), 0);
        return {
            money: this.money,
            totalRevenue: this.totalRevenue || 0,
            totalGuestsServed: this.totalGuestsServed || 0,
            currentGuests: this.getPaidGuestCount(),
            satisfaction: this.getAverageGuestSatisfaction(),
            liftCount: (this.lifts || []).length,
            maxLiftCapacity,
            pisteKmTotal: piste.totalKm,
            pisteKmBlue: piste.blueKm,
            pisteKmRed: piste.redKm,
            pisteKmBlack: piste.blackKm,
            pisteCount: piste.count,
            hotelBeds,
            gastroCount,
            shopCount,
            bestDailyProfit: this.bestDailyProfit || 0,
            day: this.dayNumber || 1,
            poiSummit: this.getPoiVisitorCount('summit'),
            poiValley: this.getPoiVisitorCount('valley'),
            poiLake: this.getPoiVisitorCount('lake')
        };
    }

    updateTraffic(dt, heightmap, gridSize) {
        const dtSec = dt / 1000;

        // Spawn Traffic
        // Spawn Traffic
        this.trafficTimer += dtSec;
        if (this.trafficTimer > 1.6) { // Dichterer Anreiseverkehr
            // Spawn Traffic more frequently if low density
            const activeCars = this.traffic.filter(v => v.state === 'DRIVING' || v.state === 'U_TURN').length;
            // Increased active limit for continuous traffic
            const guestCount = (this.guests || []).length;
            if (this._hasRoadAt(0, 10) && activeCars < 45 && this.traffic.length < 320 && guestCount < 350) {
                this.traffic.push(new TrafficVehicle(Date.now()));
            }
            this.trafficTimer = 0;
        }

        // Update Vehicles
        this.traffic = this.traffic.filter(v => {
            const shouldDespawn = v.update(dt, this, gridSize, heightmap);
            return !shouldDespawn;
        });
    }

    addLift(type, start, end) {
        if (this.money < type.cost) return false;
        const lift = new Lift(Date.now(), type, start, end);
        this.lifts.push(lift);
        this.spend(type.cost, true);
        this.recalculateEnergyUsage();
        return true;
    }

    getLiftSellValue(liftId) {
        const lift = this.lifts.find(l => l.id === liftId);
        return lift?.type?.cost || 0;
    }

    removeLift(liftId) {
        const index = this.lifts.findIndex(l => l.id === liftId);
        if (index < 0) return null;

        const [removedLift] = this.lifts.splice(index, 1);
        this.liftBoardingStats.delete(liftId);

        for (const guest of this.guests || []) {
            if (!guest || guest.shouldRemove) continue;
            const touchedLift =
                guest.liftTargetId === liftId ||
                guest.liftQueueLiftId === liftId ||
                guest.rideLiftId === liftId;

            if (!touchedLift) continue;

            if (typeof guest.leaveLiftQueue === 'function') {
                guest.leaveLiftQueue(this);
            }

            const start = removedLift.startTile || removedLift.start;
            const end = removedLift.endTile || removedLift.end;
            const dropPoint = guest.rideLiftId === liftId && (guest.rideProgress || 0) >= 0.5 ? end : start;
            if (dropPoint) {
                guest.x = dropPoint.x + 0.5;
                guest.y = dropPoint.y + 0.5;
                guest.z = dropPoint.z || guest.z || 0;
            }

            guest.liftTargetId = null;
            guest.rideLiftId = null;
            guest.rideCarrierSlot = -1;
            guest.rideProgress = 0;
            guest.rideReverse = false;
            guest.rideDurationSec = 0;
            guest.targetPos = null;
            guest.path = [];
            guest.state = 'WAITING';
            guest.nextAction = 'Lift verkauft';
            guest.liftRideCooldownSec = 0;
        }

        this.recalculateEnergyUsage();
        return removedLift;
    }

    sellLift(liftId) {
        const refund = this.getLiftSellValue(liftId);
        const removed = this.removeLift(liftId);
        if (!removed) return 0;
        this.earn(refund, 'sale');
        return refund;
    }

    setLiftSpeedMultiplier(liftId, multiplier) {
        const lift = this.lifts.find(l => l.id === liftId);
        if (!lift) return false;
        const clamped = Math.max(0.6, Math.min(2.2, Number(multiplier) || 1));
        lift.speedMultiplier = clamped;
        this.recalculateEnergyUsage();
        return true;
    }

    recordLiftBoarding(liftId, queueWaitSec = 0) {
        if (!liftId) return;
        const prev = this.liftBoardingStats.get(liftId) || { boardings: 0, totalWaitSec: 0 };
        prev.boardings += 1;
        prev.totalWaitSec += Math.max(0, queueWaitSec || 0);
        this.liftBoardingStats.set(liftId, prev);
    }

    estimateLiftUphillSlotCount(lift) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, lift?.type?.capacity || 1);
        const start = lift?.startTile || lift?.start || { x: 0, y: 0, z: 0 };
        const end = lift?.endTile || lift?.end || { x: 0, y: 0, z: 0 };
        const len = Math.sqrt(
            ((end?.x || 0) - (start?.x || 0)) ** 2 +
            ((end?.y || 0) - (start?.y || 0)) ** 2 +
            ((end?.z || 0) - (start?.z || 0)) ** 2
        );
        if (n.includes('t-bar') || n.includes('platter') || n.includes('carpet')) {
            return Math.max(1, Math.min(4, Math.floor(len / 18)));
        }
        if (n.includes('chairlift')) {
            const base = Math.max(3, Math.floor(len / 10));
            const capBoost = Math.max(0, Math.ceil((cap - 2) / 1.5));
            return Math.max(3, Math.min(18, base + capBoost));
        }
        if (n.includes('gondola')) {
            const base = Math.max(5, Math.floor(len / 10));
            const capBoost = Math.ceil(cap / 2);
            return Math.max(5, Math.min(34, base + capBoost));
        }
        if (n.includes('aerial') || n.includes('cog')) {
            const base = Math.max(6, Math.floor(len / 13));
            const capBoost = Math.ceil(cap / 8);
            return Math.max(6, Math.min(40, base + capBoost));
        }
        return Math.max(3, Math.min(12, Math.floor(len / 9)));
    }

    estimateLiftCarrierCapacity(lift) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, Math.round(lift?.type?.capacity || 1));
        if (n.includes('t-bar') || n.includes('platter') || n.includes('carpet')) return Math.min(2, cap);
        if (n.includes('chairlift')) return Math.min(8, cap);
        if (n.includes('gondola')) return Math.min(24, cap);
        if (n.includes('aerial') || n.includes('cog')) return Math.min(80, cap);
        return Math.min(6, cap);
    }

    estimateLiftBoardIntervalSec(lift) {
        const n = (lift?.type?.name || '').toLowerCase();
        const cap = Math.max(1, lift?.type?.capacity || 1);
        const speedMul = Math.max(0.6, Math.min(2.2, lift?.speedMultiplier || 1));
        let interval = 2.2;
        if (n.includes('t-bar') || n.includes('platter') || n.includes('carpet')) interval = 3.9;
        else if (n.includes('chairlift')) interval = Math.max(0.9, 2.1 - Math.max(0, (cap - 2) * 0.12));
        else if (n.includes('gondola')) interval = Math.max(0.3, 1.25 - Math.max(0, (cap - 8) * 0.055));
        else if (n.includes('aerial') || n.includes('cog')) interval = Math.max(0.22, 0.7 - Math.max(0, (cap - 40) * 0.006));
        return Math.max(0.15, interval / speedMul);
    }

    getLiftLiveStats(liftId) {
        const lift = this.lifts.find(l => l.id === liftId);
        if (!lift) return null;
        const board = this.liftBoardingStats.get(liftId) || { boardings: 0, totalWaitSec: 0 };
        const queueLength = lift?.guestQueue?.length || 0;
        const ridingCount = (this.guests || []).filter(g => g && !g.shouldRemove && g.state === 'RIDING_LIFT' && g.rideLiftId === liftId).length;
        const maxRiding = Math.max(1, this.estimateLiftUphillSlotCount(lift) * this.estimateLiftCarrierCapacity(lift));
        const utilizationPct = Math.round(Math.max(0, Math.min(100, (ridingCount / maxRiding) * 100)));
        const avgWaitSec = board.boardings > 0 ? (board.totalWaitSec / board.boardings) : 0;
        const perHour = Math.round((3600 / this.estimateLiftBoardIntervalSec(lift)) * this.estimateLiftCarrierCapacity(lift));
        const perDay = perHour * 24;
        return {
            queueLength,
            ridingCount,
            maxRiding,
            utilizationPct,
            avgWaitSec,
            boardings: board.boardings,
            transportPerHour: perHour,
            transportPerDay: perDay,
            speedMultiplier: lift.speedMultiplier || 1
        };
    }

    recalculateEnergyUsage() {
        let total = 0;
        for (const lift of this.lifts || []) {
            const start = lift?.startTile || lift?.start || { x: 0, y: 0, z: 0 };
            const end = lift?.endTile || lift?.end || { x: 0, y: 0, z: 0 };
            const len = Math.sqrt(
                ((end?.x || 0) - (start?.x || 0)) ** 2 +
                ((end?.y || 0) - (start?.y || 0)) ** 2 +
                ((end?.z || 0) - (start?.z || 0)) ** 2
            );
            const base = 14 + Math.max(1, (lift.type?.capacity || 1) * 0.85) + len * 0.7;
            const speedMul = Math.max(0.6, Math.min(2.2, lift.speedMultiplier || 1));
            total += base * Math.pow(speedMul, 1.8);
        }
        this.totalEnergyUsage = Math.round(total);
        return this.totalEnergyUsage;
    }

    getTotalEnergyUsage() {
        return this.totalEnergyUsage || 0;
    }

    // Piste management
    createPiste(width) {
        return {
            id: this.nextPisteId++,
            width,
            segments: [],
            totalCost: 0
        };
    }

    addPisteSegment(piste, x, y, z, heightmap, gridSize) {
        // Check Endpoint
        if (isCliff(x, y, heightmap, gridSize)) {
            return { success: false, reason: 'Zu steiles Gelände (Fels)!' };
        }

        const segments = piste.segments;
        let gradient = 0;

        // Check path from last segment (prevent tunneling through cliffs)
        if (segments.length > 0) {
            const last = segments[segments.length - 1];
            const dx = x - last.x;
            const dy = y - last.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Check every 0.25 tiles along the path (High Precision)
            const steps = Math.ceil(dist * 4);
            if (steps > 0) {
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps;
                    const tx = Math.floor(last.x + dx * t);
                    const ty = Math.floor(last.y + dy * t);

                    // Skip if it's the start or end node (already checked/is valid)
                    if ((tx === Math.floor(last.x) && ty === Math.floor(last.y)) ||
                        (tx === Math.floor(x) && ty === Math.floor(y))) {
                        continue;
                    }

                    if (isCliff(tx, ty, heightmap, gridSize)) {
                        return { success: false, reason: 'Strecke führt durch Fels!' };
                    }
                }
            }

            if (dist === 0) return { success: true };

            const heightDiff = last.z - z;
            gradient = ((heightDiff / dist) * 10) / 1.5;

            // Constraint: Pistes cannot go uphill > 5%
            if (gradient < -5) {
                return { success: false, reason: 'Piste zu steil aufwärts!' };
            }
        }

        // Determine difficulty based on recent gradient (last ~100m = ~2 segments)
        const recentSegments = segments.slice(-2);
        const avgGradient = recentSegments.length > 0
            ? (recentSegments.reduce((sum, s) => sum + (s.gradient || 0), 0) + gradient) / (recentSegments.length + 1)
            : gradient;

        let difficulty = 'BLUE';
        if (avgGradient >= 55) difficulty = 'BLACK';   // >55% → Schwarz
        else if (avgGradient >= 35) difficulty = 'RED';  // 35-55% → Rot
        // <35% → Blau
        segments.push({ x, y, z, gradient, difficulty });
        piste.totalCost += piste.width.costPer50m;
        return { success: true };
    }

    completePiste(piste) {
        if (this.money < piste.totalCost) return false;

        // Calculate average gradient across all segments
        let totalGradient = 0;
        let gradientCount = 0;
        piste.segments.forEach(seg => {
            if (seg.gradient !== undefined) {
                totalGradient += Math.abs(seg.gradient);
                gradientCount++;
            }
        });

        const avgGradient = gradientCount > 0 ? totalGradient / gradientCount : 0;
        piste.avgGradient = avgGradient;

        // Determine difficulty based on average gradient
        let avgDifficulty = 'BLUE';
        if (avgGradient >= 55) avgDifficulty = 'BLACK';
        else if (avgGradient >= 35) avgDifficulty = 'RED';

        piste.avgDifficulty = avgDifficulty;
        piste.number = this.pistes.length + 1;
        piste.needsGrooming = true; // Starts needing grooming
        piste.isBeingGroomed = false;
        piste.condition = 0.5; // 50%

        // Calculate altitude-dependent snow depth
        // Map average altitude (0..255) to snow depth (15..100cm)
        let totalZ = 0;
        let zCount = 0;
        piste.segments.forEach(seg => {
            if (seg.z !== undefined) {
                totalZ += seg.z;
                zCount++;
            }
        });
        const avgZ = zCount > 0 ? totalZ / zCount : 100; // Fallback
        piste.snowDepth = Math.round(15 + (avgZ / 255) * 85);

        // Calculate total length
        let totalLength = 0;
        for (let i = 1; i < piste.segments.length; i++) {
            const prev = piste.segments[i - 1];
            const curr = piste.segments[i];
            const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
            if (!isNaN(dist)) totalLength += dist * 20;
        }
        piste.length = Math.round(totalLength) || 0;

        // Initialize per-segment condition tracking for progressive grooming
        piste.segmentConditions = new Array(piste.segments.length).fill(0.5);

        this.pistes.push(piste);
        this.spend(piste.totalCost, true);
        return true;
    }

    removePiste(pisteId) {
        const idx = this.pistes.findIndex(p => p.id === pisteId);
        if (idx < 0) return false;

        const [removed] = this.pistes.splice(idx, 1);

        for (const guest of this.guests || []) {
            if (!guest || guest.shouldRemove) continue;
            const touchesRemoved =
                guest.activePisteId === pisteId ||
                guest.postRideRoute?.pisteId === pisteId;

            if (!touchesRemoved) continue;

            guest.activePisteId = null;
            guest.postRideStep = null;
            guest.postRideRoute = null;
            guest.postRideEndPoint = null;

            if (guest.state === 'SKIING') {
                guest.state = 'WAITING';
                guest.skiRoute = null;
                guest.skiRouteCumLen = null;
                guest.skiRouteLength = 0;
                guest.skiDistance = 0;
                guest.hasSkis = false;
                guest.nextAction = 'Piste geschlossen';
                guest.liftRideCooldownSec = 0;
            } else if (guest.state === 'WALKING') {
                guest.state = 'WAITING';
                guest.targetPos = null;
                guest.path = [];
                guest.nextAction = 'Neue Piste suchen';
            }
        }

        for (const bully of this.pistenbullies || []) {
            if (!bully?.assignedPiste || bully.assignedPiste.id !== pisteId) continue;
            if (bully.assignedPiste) bully.assignedPiste.isBeingGroomed = false;
            bully.assignedPiste = null;
            if (this.heightmap && this.gridSize) {
                bully.returnToGarage(this, this.gridSize, this.heightmap, null);
            } else {
                bully.state = 'GARAGE';
            }
        }

        return removed;
    }

    // Building management
    placeBuilding(x, y, buildingType, heightmap, gridSize, landcover, rotation = 0) {
        if (!heightmap) return { success: false, reason: 'Welt wird geladen...' };
        if (this.money < buildingType.cost) return { success: false, reason: 'Nicht genügend Geld' };

        // Check if terrain is suitable (must be relatively flat)
        // Default maxSlope is 10 (Standard for "Pure Buildings"), unless overridden by building type (e.g. 25 for Huts, 100 for Cannons)
        const maxSlopeAllowed = buildingType.maxSlope !== undefined ? buildingType.maxSlope : 10;
        let maxHeightDiff = 0;
        const size = buildingType.size;

        // Check all tiles that the building will occupy
        for (let dx = 0; dx < size.width; dx++) {
            for (let dy = 0; dy < size.height; dy++) {
                const tx = x + dx;
                const ty = y + dy;
                if (tx >= gridSize || ty >= gridSize) {
                    return { success: false, reason: 'Außerhalb der Karte' };
                }

                const idx = ty * gridSize + tx;
                const height = heightmap[idx];

                // Check against center tile
                const centerIdx = y * gridSize + x;
                const centerHeight = heightmap[centerIdx];
                maxHeightDiff = Math.max(maxHeightDiff, Math.abs(height - centerHeight));
            }
        }

        // Validate placement rules (Slope, Water, etc.)
        const validation = this.validateBuildingPlacement(x, y, buildingType, heightmap, gridSize, landcover);
        if (!validation.valid) {
            console.warn(`⚠️ Placement failed: ${validation.reason}`);
            return { success: false, reason: validation.reason };
        }

        // Check for overlapping buildings
        for (const building of this.buildings) {
            if (this._buildingsOverlap(x, y, size, building)) {
                return { success: false, reason: 'Platz bereits belegt' };
            }
        }

        // Place building
        const building = {
            id: Date.now(),
            type: buildingType,
            x,
            y,
            rotation,
            placed: Date.now(),
            // Runtime data for info panel
            currentOccupancy: 0,
            basePrice: buildingType.basePrice !== undefined ? buildingType.basePrice : (buildingType.dailyRevenue ? Math.round(buildingType.dailyRevenue / (buildingType.capacity || 50)) : 100),
            customPrice: null,  // null = use base price
            maintenanceCost: buildingType.maintenanceCost !== undefined ? buildingType.maintenanceCost : Math.round(buildingType.cost * 0.002),  // 0.2% of build cost per month
            satisfaction: 75,   // Start at 75%
            monthlyRevenue: 0,
            monthlyProfit: 0
        };

        this.buildings.push(building);
        this.spend(buildingType.cost, true);
        return { success: true, building };
    }

    validateBuildingPlacement(x, y, buildingType, heightmap, gridSize, landcover) {
        if (!heightmap) return { valid: true }; // Not loaded yet

        // Check grid bounds
        const size = buildingType.size;
        if (x + size.width > gridSize || y + size.height > gridSize) {
            return { valid: false, reason: 'Außerhalb der Karte' };
        }

        // Check for Water (ID 2)
        if (landcover) {
            for (let dx = 0; dx < size.width; dx++) {
                for (let dy = 0; dy < size.height; dy++) {
                    const idx = (y + dy) * gridSize + (x + dx);
                    if (landcover[idx] === 2 && !buildingType.isWaterTool) {
                        return { valid: false, reason: 'Nicht im Wasser bauen!' };
                    }
                }
            }
        }

        // Check slope constraints
        let minH = Infinity;
        let maxH = -Infinity;
        for (let dx = 0; dx < size.width; dx++) {
            for (let dy = 0; dy < size.height; dy++) {
                const h = heightmap[(y + dy) * gridSize + (x + dx)];
                minH = Math.min(minH, h);
                maxH = Math.max(maxH, h);
            }
        }
        const diff = maxH - minH;

        // Road can handle some slope
        if (buildingType.id === 'road') {
            if (diff > 5) return { valid: false, reason: 'Zu steil für Straße' };
        } else if (buildingType.isWaterTool) {
            // Water tool logic
        } else {
            // Regular building needs flat ground
            if (diff > 1.5) return { valid: false, reason: 'Untergrund zu uneben' };
        }

        return { valid: true };
    }

    _buildingsOverlap(x, y, size, existingBuilding) {
        const ex = existingBuilding.x;
        const ey = existingBuilding.y;
        const eSize = existingBuilding.type.size;

        return !(
            x + size.width <= ex ||
            x >= ex + eSize.width ||
            y + size.height <= ey ||
            y >= ey + eSize.height
        );
    }

    getRoadNeighbors(x, y, gridSize) {
        let mask = 0;
        // North (x, y-1) -> Bit 1
        if (this._hasRoadAt(x, y - 1)) mask |= 1;
        // East (x+1, y) -> Bit 2
        if (this._hasRoadAt(x + 1, y)) mask |= 2;
        // South (x, y+1) -> Bit 4
        if (this._hasRoadAt(x, y + 1)) mask |= 4;
        // West (x-1, y) -> Bit 8
        if (this._hasRoadAt(x - 1, y)) mask |= 8;
        return mask;
    }

    _hasRoadAt(x, y) {
        return this.buildings.some(b => b.type.id === 'road' && Math.floor(b.x) === x && Math.floor(b.y) === y);
    }

    removeBuilding(buildingId) {
        const index = this.buildings.findIndex(b => b.id === buildingId);
        if (index !== -1) {
            const [building] = this.buildings.splice(index, 1);

            if (building?.guestQueue) {
                building.guestQueue.length = 0;
            }

            for (const guest of this.guests || []) {
                if (!guest || guest.shouldRemove) continue;
                const queuedAtTicketOffice = building?.type?.id === 'ticket_office' && guest.queuePosition !== -1 && !guest.hasLiftPass;
                const targetsBuilding = guest.needTargetBuildingId === buildingId || guest.serviceBuildingId === buildingId;
                const ownsHotel = guest.hotelBuildingId === buildingId;

                if (!queuedAtTicketOffice && !targetsBuilding && !ownsHotel) continue;

                if (queuedAtTicketOffice) {
                    guest.queuePosition = -1;
                    guest.state = 'WAITING';
                    guest.nextAction = 'Ticketkasse fehlt';
                    guest.targetPos = null;
                    guest.path = [];
                }

                if (targetsBuilding) {
                    guest.needTargetType = null;
                    guest.needTargetBuildingId = null;
                    guest.serviceType = null;
                    guest.serviceBuildingId = null;
                    guest.serviceRemainingSec = 0;
                    guest.state = 'WAITING';
                    guest.nextAction = 'Gebäude verkauft';
                    guest.targetPos = null;
                    guest.path = [];
                }

                if (ownsHotel) {
                    guest.hotelBuildingId = null;
                    guest.hotelCheckInPending = false;
                    if (!targetsBuilding) {
                        guest.nextAction = 'Hotel verkauft';
                    }
                }
            }

            return building;
        }
        return null;
    }

    getBuildingSellValue(buildingId) {
        const building = this.buildings.find(b => b.id === buildingId);
        return building?.type?.cost || 0;
    }

    sellBuilding(buildingId) {
        const refund = this.getBuildingSellValue(buildingId);
        const removed = this.removeBuilding(buildingId);
        if (!removed) return 0;
        this.earn(refund, 'sale');
        return refund;
    }

    calculateDailyRevenue() {
        return this.buildings.reduce((total, building) => {
            return total + (building.type.dailyRevenue || 0);
        }, 0);
    }

    getCurrentDayNumber() {
        return this.dayNumber || 1;
    }

    getDayCycleProgress() {
        const daySec = Math.max(1, this.dayDurationSec || 300);
        const duskSec = Math.max(0, this.duskDurationSec || 5);
        const cycle = daySec + duskSec;
        const t = ((this.currentTime || 0) % cycle + cycle) % cycle;
        return Math.max(0, Math.min(1, t / daySec));
    }

    // Get building by ID
    getBuildingById(id) {
        return this.buildings.find(b => b.id === id);
    }

    getBuildingCurrentPrice(building) {
        if (!building) return 0;
        const fallback = building.type?.basePrice ?? building.basePrice ?? 0;
        const raw = building.customPrice !== null && building.customPrice !== undefined
            ? building.customPrice
            : fallback;
        return Math.max(1, Math.round(raw || 0));
    }

    getHotelStayCost(hotelBuilding, stayDays) {
        if (!hotelBuilding) return 0;
        const nights = Math.max(1, Math.round(stayDays || 1));
        return this.getBuildingCurrentPrice(hotelBuilding) * nights;
    }

    findAvailableHotelForGuest(guest, stayDays = 1) {
        if (!guest || stayDays <= 1) return null;
        const hotels = this.buildings.filter(b => b.type?.category === 'hotel');
        if (!hotels.length) return null;

        let best = null;
        let bestScore = Infinity;
        for (const hotel of hotels) {
            const capacity = Math.max(1, hotel.type?.capacity || 0);
            const occupied = (this.guests || []).filter(g =>
                g &&
                !g.shouldRemove &&
                g.hotelBuildingId === hotel.id
            ).length;
            if (occupied >= capacity) continue;

            const { w, h } = this.getBuildingFootprint(hotel);
            const hx = hotel.x + w / 2;
            const hy = hotel.y + h / 2;
            const dist = Math.abs((guest.x || 0) - hx) + Math.abs((guest.y || 0) - hy);
            const hotelCost = this.getHotelStayCost(hotel, stayDays);
            const score = dist + hotelCost * 0.015;
            if (score < bestScore) {
                bestScore = score;
                best = hotel;
            }
        }

        return best;
    }

    refreshDynamicBuildingOccupancy() {
        const byId = new Map((this.buildings || []).map(b => [b.id, b]));
        const resetBlockedIds = new Set(['road', 'parking_lot', 'parking_garage', 'bus_stop', 'ticket_office']);
        for (const b of this.buildings || []) {
            if (resetBlockedIds.has(b.type?.id)) continue;
            b.currentOccupancy = 0;
        }

        for (const g of this.guests || []) {
            if (!g || g.shouldRemove) continue;

            if (g.hotelBuildingId) {
                const hb = byId.get(g.hotelBuildingId);
                if (hb) {
                    hb.currentOccupancy = (hb.currentOccupancy || 0) + 1;
                }
            }

            if (g.state === 'IN_SERVICE' && g.serviceBuildingId) {
                if (g.hotelBuildingId && g.serviceBuildingId === g.hotelBuildingId) continue;
                const sb = byId.get(g.serviceBuildingId);
                if (sb) {
                    sb.currentOccupancy = (sb.currentOccupancy || 0) + 1;
                }
            }
        }

        for (const b of this.buildings || []) {
            const cap = Math.max(1, b.type?.capacity || 1);
            if (!resetBlockedIds.has(b.type?.id)) {
                b.currentOccupancy = Math.max(0, Math.min(cap, Math.round(b.currentOccupancy || 0)));
            }
        }
    }

    // Set custom price for a building
    setBuildingPrice(buildingId, newPrice) {
        const building = this.getBuildingById(buildingId);
        if (building) {
            building.customPrice = newPrice;
            this.updateBuildingEconomics(building);
            return true;
        }
        return false;
    }

    // Update building economics (occupancy, revenue, profit)
    updateBuildingEconomics(building) {
        if (!building || !building.type) return;

        const capacity = building.type.capacity || 50;
        const basePrice = building.basePrice || 100;
        const currentPrice = building.customPrice !== null ? building.customPrice : basePrice;

        // Price affects occupancy - higher price = lower occupancy
        const priceRatio = currentPrice / basePrice;
        const priceEffect = Math.max(0.2, Math.min(1.5, 2 - priceRatio));  // 0.2 to 1.5

        // NEW: Global Ski Pass Effect
        // If the ski pass is too expensive, fewer people come to the resort overall
        // only applies if it's not the ticket office itself or a road
        const globalEffect = this.getSkiPassAttractiveness() / 80; // 80% is neutral

        // ... (rest of updateBuildingEconomics logic)
    }

    // Pistenbully Logic
    manageVehicles(heightmap, gridSize) {
        // Check all garages
        this.buildings.forEach(b => {
            if (b.type.isGarage) {
                const maxCapacity = b.type.garageSize || 1;
                // Count how many bullies are already assigned to this specific garage building
                const assignedBullies = this.pistenbullies.filter(pb => pb.garage.id === b.id);

                if (assignedBullies.length < maxCapacity) {
                    // Spawn missing bullies
                    const toSpawn = maxCapacity - assignedBullies.length;
                    for (let i = 0; i < toSpawn; i++) {
                        const pb = new Pistenbully(Date.now() + Math.random(), b);
                        this.pistenbullies.push(pb);
                    }
                }
            }

            // Check medical stations for Ski-Doos
            if (b.type.spawnsSkiDoo) {
                // Each medical station spawns 1 Ski-Doo
                const assignedSkidoos = this.skidoos.filter(sd => sd.station.id === b.id);

                if (assignedSkidoos.length === 0) {
                    const sd = new SkiDoo(Date.now() + Math.random(), b);
                    this.skidoos.push(sd);
                }
            }

            // Check medical stations for Helicopters
            if (b.type.spawnsHelicopter) {
                const assignedHelis = this.helicopters.filter(h => h.station.id === b.id);
                if (assignedHelis.length === 0) {
                    const h = new Helicopter(b);
                    this.helicopters.push(h);
                }
            }
        });
    }

    updatePistenbullies(dt, heightmap, gridSize, landcover) {
        // dt in ms
        this.manageVehicles(heightmap, gridSize); // Ensure everyone has a vehicle (simple auto-spawn)

        this.pistenbullies.forEach(pb => {
            pb.update(dt, this, gridSize, heightmap, landcover);
        });
    }

    updateSkidoos(dt, heightmap, gridSize, landcover) {
        // dt in ms
        this.skidoos.forEach(sd => {
            sd.update(dt, this, gridSize, heightmap, landcover);
        });
    }

    updateHelicopters(dt, heightmap, gridSize, landcover) {
        // dt in ms
        const dtSec = dt / 1000;
        // getZ helper
        const getZ = (wx, wy) => {
            const x0 = Math.floor(Math.max(0, Math.min(gridSize - 1, wx)));
            const y0 = Math.floor(Math.max(0, Math.min(gridSize - 1, wy)));
            const x1 = Math.min(gridSize - 1, x0 + 1);
            const y1 = Math.min(gridSize - 1, y0 + 1);
            const tx = wx - x0;
            const ty = wy - y0;
            const h00 = heightmap[y0 * gridSize + x0] || 0;
            const h10 = heightmap[y0 * gridSize + x1] || 0;
            const h01 = heightmap[y1 * gridSize + x0] || 0;
            const h11 = heightmap[y1 * gridSize + x1] || 0;
            const h0 = h00 * (1 - tx) + h10 * tx;
            const h1 = h01 * (1 - tx) + h11 * tx;
            return h0 * (1 - ty) + h1 * ty;
        };

        this.helicopters.forEach(h => {
            h.update(dtSec, gridSize, getZ);
        });
    }

    // Update all buildings' economics (call periodically)
    updateAllBuildingsEconomics() {
        this.buildings.forEach(building => {
            if (!building.type.isRoad) {
                this.updateBuildingEconomics(building);
            }
        });
    }

    // Calculate total monthly profit from all buildings
    calculateMonthlyProfit() {
        return this.buildings.reduce((total, building) => {
            return total + (building.monthlyProfit || 0);
        }, 0);
    }

    // Ski Pass System Methods
    getSkiPassPrice() {
        return this.customSkiPassPrice !== null ? this.customSkiPassPrice : this.baseSkiPassPrice;
    }

    setSkiPassPrice(newPrice) {
        this.customSkiPassPrice = newPrice;
    }

    // Calculate attractiveness based on ski pass price (0-100)
    // Now considers average tolerance across guest categories, favoring less sensitive ones like Premium/Luxury
    getSkiPassAttractiveness() {
        const price = this.getSkiPassPrice();
        const priceRatio = price / this.baseSkiPassPrice;

        // Calculate weighted tolerance based on guest categories
        // In a real simulation, this would depend on current guest mix
        // For now, we use a weighted average price multiplier
        // Sparfüchse (0.7), Familien (0.9), Mittelklasse (1.0), Premium (1.3), Luxus (1.5)
        const avgTolerance = 1.1; // Shifted towards more tolerance due to Premium

        // Lower price = higher attractiveness
        // If priceRatio <= avgTolerance, attractiveness stays high
        const sensitivity = 40;
        return Math.round(Math.min(100, Math.max(10, 100 - (priceRatio - avgTolerance + 0.2) * sensitivity)));
    }

    // Check if resort has at least one ticket office
    hasTicketOffice() {
        return this.buildings.some(b => b.type.isTicketOffice);
    }

    // Count ticket offices for queue capacity
    countTicketOffices() {
        return this.buildings.filter(b => b.type.isTicketOffice).length;
    }

    // Calculate potential ski pass sales based on price and capacity
    calculatePotentialSkiPassSales() {
        const ticketOffices = this.countTicketOffices();
        if (ticketOffices === 0) return 0;

        const attractiveness = this.getSkiPassAttractiveness();
        const baseCapacity = ticketOffices * 100; // 100 per office
        return Math.round(baseCapacity * (attractiveness / 100));
    }

    getPaidGuestCount() {
        if (!this.guests || this.guests.length === 0) return 0;
        return this.guests.filter(g => g.hasLiftPass && !g.shouldRemove).length;
    }

    // --- NEW: COST AGGREGATION METHODS ---

    /**
     * Calculates the total monthly maintenance for ALL buildings and lifts.
     */
    calculateTotalMonthlyOperatingCosts() {
        // 1. Building maintenance
        const buildingCosts = this.buildings.reduce((sum, b) => sum + (b.maintenanceCost || 0), 0);

        // 2. Lift maintenance (Approx. 0.5% of build cost per month)
        const liftCosts = this.lifts.reduce((sum, l) => {
            const maintenance = l.type.cost * 0.005;
            return sum + maintenance;
        }, 0);

        return Math.round(buildingCosts + liftCosts);
    }

    /**
     * Returns a breakdown of different cost categories for the Ticket Office UI.
     */
    getOperatingCostBreakdown() {
        const buildingsCost = this.buildings.reduce((sum, b) => sum + (b.maintenanceCost || 0), 0);
        const liftsCost = this.lifts.reduce((sum, l) => sum + (l.type.cost * 0.005), 0);

        // Split buildings by category for more detail
        const pistenCost = this.buildings
            .filter(b => b.type.category === 'pisten')
            .reduce((sum, b) => sum + (b.maintenanceCost || 0), 0);

        return {
            total: Math.round(buildingsCost + liftsCost),
            lifts: Math.round(liftsCost),
            infrastructure: Math.round(buildingsCost - pistenCost),
            slopeOps: Math.round(pistenCost)
        };
    }

    calculateDailyOperatingCosts() {
        return Math.round(this.calculateTotalMonthlyOperatingCosts() / 30);
    }

    /**
     * ADVANCED ECONOMICS: Process one game day.
     * Subtracts maintenance and adds REAL revenue from ski passes.
     */
    stepDay() {
        this.dayNumber = (this.dayNumber || 1) + 1;
        // 1. Calculate Costs
        const costs = this.getOperatingCostBreakdown();
        const dailyTotalCost = Math.round(costs.total / 30);

        // 2. Real sales/revenue from actual ticket purchases during the day
        const dailySales = this.skiPassSalesToday || 0;
        const skiPassRevenue = this.skiPassRevenueToday || 0;
        const gastroRevenue = this.gastroRevenueToday || 0;
        const hotelRevenue = this.hotelRevenueToday || 0;
        const parkingRevenue = this.parkingRevenueToday || 0;
        const dailyRevenue = skiPassRevenue + gastroRevenue + hotelRevenue + parkingRevenue;

        // 3. Update Balance (operating costs may push the balance negative)
        this.spend(dailyTotalCost, true);

        // 4. Update stats for UI
        this.lastDailyRevenue = dailyRevenue;
        this.lastDailyCost = dailyTotalCost;
        this.dailySkiPassRevenue = skiPassRevenue;
        this.skiPassSalesToday = 0;
        this.skiPassRevenueToday = 0;
        this.gastroRevenueToday = 0;
        this.hotelRevenueToday = 0;
        this.parkingRevenueToday = 0;
        this.lastDailyProfit = dailyRevenue - dailyTotalCost;
        if ((this.lastDailyProfit || 0) > (this.bestDailyProfit || 0)) this.bestDailyProfit = this.lastDailyProfit;

        // 4.5 SCHNEEHÖHEN-SYSTEM
        // Jede Piste verliert täglich Schnee (mehr in tiefen Lagen).
        // Natürlicher Schneefall hilft manchmal — verlässlich sind nur
        // Schneekanonen in Reichweite der Piste. Ohne Schnee bricht die
        // Pistenqualität ein → Schneekanonen werden Pflicht.
        {
            const cannons = (this.buildings || []).filter(b => b.type?.isSnowCannon);
            const naturalSnow = Math.random() < 0.32 ? 5 + Math.random() * 7 : 0; // ~jeder 3. Tag Neuschnee
            for (const p of this.pistes || []) {
                if (!p?.segments?.length) continue;
                let totalZ = 0, n = 0;
                for (const seg of p.segments) { totalZ += seg.z || 0; n++; }
                const avgZ = n ? totalZ / n : 100;
                // Schmelze: tiefe Lagen verlieren deutlich mehr Schnee
                const melt = Math.max(1.5, 8 - avgZ / 50);

                // Schneekanonen-Leistung (größte Kanone in Reichweite zählt)
                let cannonPower = 0;
                for (const c of cannons) {
                    const r = c.type.snowRadius || 10;
                    const cx = c.x + (c.type.size?.width || 1) / 2;
                    const cy = c.y + (c.type.size?.height || 1) / 2;
                    for (let i = 0; i < p.segments.length; i += 3) {
                        const seg = p.segments[i];
                        if (Math.hypot(cx - seg.x, cy - seg.y) <= r) {
                            cannonPower = Math.max(cannonPower, r >= 25 ? 14 : r >= 18 ? 11 : 8);
                            break;
                        }
                    }
                }

                p.snowDepth = Math.max(0, Math.min(140, (p.snowDepth ?? 40) + naturalSnow + cannonPower - melt));

                // Dünne Schneedecke → Pistenzustand verfällt schnell
                if (p.snowDepth < 20) {
                    const decay = p.snowDepth <= 5 ? 0.35 : 0.2;
                    p.condition = Math.max(0.05, (p.condition ?? 0.5) - decay);
                    if (p.segmentConditions) {
                        p.segmentConditions = p.segmentConditions.map(cv => Math.max(0.05, cv - decay));
                    }
                    p.needsGrooming = true;
                }
            }
        }

        // 5. Advance guest pass validity and remove expired guests
        if (this.guests && this.guests.length > 0) {
            this.guests.forEach(g => g.onDayPassed(this));
            this.guests = this.guests.filter(g => !g.shouldRemove);
        }
        if (this.traffic && this.traffic.length > 0) {
            this.traffic = this.traffic.filter(v => {
                if (!v) return false;
                if (!v.shouldDespawnAtDayEnd) return true;
                if (v.parkingLot?.currentOccupancy > 0) {
                    v.parkingLot.currentOccupancy--;
                }
                return false;
            });
        }
        this.refreshDynamicBuildingOccupancy();

        return {
            revenue: dailyRevenue,
            cost: dailyTotalCost,
            profit: dailyRevenue - dailyTotalCost,
            sales: dailySales
        };
    }

    /**
     * Update all vehicles and systems (Animation Loop)
     */
    update(deltaTime, heightmap, gridSize, landcover = null) {
        this.heightmap = heightmap;
        this.gridSize = gridSize;
        this.landcover = landcover;

        // Update game time
        this.currentTime += deltaTime / 1000;

        // POI-Besucher zählen (Gipfelkreuz, Talkreuz, Bergsee)
        this.updatePoiVisitors(deltaTime / 1000);

        // 1. Update Lifts
        this.lifts.forEach(lift => lift.update(deltaTime));

        // 2. Update Pistes (Status degradation)
        this.updatePistes(deltaTime);

        // 3. Update Guests
        if (this.guests && this.guests.length > 0) {
            this.guests = this.guests.filter(guest => {
                guest.update(deltaTime, this, gridSize);
                return !guest.shouldRemove;
            });
        }
        this.refreshDynamicBuildingOccupancy();
        this.recalculateEnergyUsage();

        // Note: Pistenbully updates are called directly from WorldCanvas via updatePistenbullies
    }

    getAverageGuestSatisfaction() {
        const paidGuests = (this.guests || []).filter(g => g.hasLiftPass && !g.shouldRemove);
        if (paidGuests.length === 0) return 80;
        const total = paidGuests.reduce((sum, g) => sum + (g.satisfaction || 0), 0);
        return Math.round(total / paidGuests.length);
    }

    getTileHeight(x, y) {
        if (!this.heightmap || !this.gridSize) return 0;
        const tx = Math.max(0, Math.min(this.gridSize - 1, Math.floor(x)));
        const ty = Math.max(0, Math.min(this.gridSize - 1, Math.floor(y)));
        return this.heightmap[ty * this.gridSize + tx] || 0;
    }

    getBuildingFootprint(building) {
        const rot = building.rotation || 0;
        const isRotated = rot === 90 || rot === 270;
        const w = isRotated ? building.type.size.height : building.type.size.width;
        const h = isRotated ? building.type.size.width : building.type.size.height;
        return { w, h };
    }

    isTileBlocked(x, y, ignoreBuilding = null) {
        for (const b of this.buildings) {
            if (ignoreBuilding && b === ignoreBuilding) continue;
            if (b.type.isRoad) continue;
            const { w, h } = this.getBuildingFootprint(b);
            if (x >= b.x && x < b.x + w && y >= b.y && y < b.y + h) {
                return true;
            }
        }
        return false;
    }

    isRoadTile(x, y) {
        for (const b of this.buildings) {
            if (!b.type.isRoad) continue;
            const bRot = b.rotation || 0;
            const isRotated = bRot === 90 || bRot === 270;
            const w = isRotated ? b.type.size.height : b.type.size.width;
            const h = isRotated ? b.type.size.width : b.type.size.height;
            if (x >= b.x && x < b.x + w && y >= b.y && y < b.y + h) {
                return true;
            }
        }
        return false;
    }

    isTileBlockedForGuests(_x, _y, _ignoreBuilding = null) {
        // Guests can path "through" buildings; visibility is handled in rendering.
        return false;
    }

    findNearestWalkableTile(x, y, gridSize, maxRadius = 4, forGuests = false) {
        const start = {
            x: Math.max(0, Math.min(gridSize - 1, Math.floor(x))),
            y: Math.max(0, Math.min(gridSize - 1, Math.floor(y)))
        };
        const blocked = forGuests ? this.isTileBlockedForGuests(start.x, start.y) : this.isTileBlocked(start.x, start.y);
        if (!blocked) return start;

        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tx = start.x + dx;
                    const ty = start.y + dy;
                    if (tx < 0 || tx >= gridSize || ty < 0 || ty >= gridSize) continue;
                    const blockedTile = forGuests ? this.isTileBlockedForGuests(tx, ty) : this.isTileBlocked(tx, ty);
                    if (!blockedTile) return { x: tx, y: ty };
                }
            }
        }
        return null;
    }

    findGuestPath(startX, startY, endX, endY, gridSize, ignoreBuilding = null) {
        const start = { x: Math.floor(startX), y: Math.floor(startY) };
        const goal = { x: Math.floor(endX), y: Math.floor(endY) };
        const heightmap = this.heightmap;
        const landcover = this.landcover;

        if (start.x === goal.x && start.y === goal.y) return [];
        if (start.x < 0 || start.x >= gridSize || start.y < 0 || start.y >= gridSize) return [];
        if (goal.x < 0 || goal.x >= gridSize || goal.y < 0 || goal.y >= gridSize) return [];
        if (this.isTileBlockedForGuests(goal.x, goal.y, ignoreBuilding)) return [];

        const key = (p) => `${p.x},${p.y}`;
        const h = (p) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
        const roadTiles = new Set();
        const hardscapeTiles = new Set();
        const hardscapeIds = new Set(['road', 'parking_lot', 'parking_garage', 'bus_stop', 'ticket_office']);
        const hardscapeCategories = new Set(['hotel', 'gastronomy', 'shop', 'tourism', 'infrastructure']);

        for (const b of this.buildings || []) {
            if (!b || (ignoreBuilding && b === ignoreBuilding)) continue;
            const { w, h: bh } = this.getBuildingFootprint(b);
            const isRoad = !!b.type?.isRoad;
            const isHardscape = isRoad || hardscapeIds.has(b.type?.id) || hardscapeCategories.has(b.type?.category);
            if (!isHardscape) continue;
            for (let dx = 0; dx < w; dx++) {
                for (let dy = 0; dy < bh; dy++) {
                    const tx = Math.floor(b.x + dx);
                    const ty = Math.floor(b.y + dy);
                    const tileKey = `${tx},${ty}`;
                    hardscapeTiles.add(tileKey);
                    if (isRoad) roadTiles.add(tileKey);
                }
            }
        }

        const pisteTiles = new Set();
        for (const piste of this.pistes || []) {
            if (!piste?.segments?.length) continue;
            piste.segments.forEach((seg, idx) => {
                if (!seg) return;
                const px = Math.floor(seg.x);
                const py = Math.floor(seg.y);
                pisteTiles.add(`${px},${py}`);
                if (idx > 0) {
                    const prev = piste.segments[idx - 1];
                    const steps = Math.max(1, Math.ceil(Math.sqrt((seg.x - prev.x) ** 2 + (seg.y - prev.y) ** 2) * 2));
                    for (let step = 1; step < steps; step++) {
                        const t = step / steps;
                        pisteTiles.add(`${Math.floor(prev.x + (seg.x - prev.x) * t)},${Math.floor(prev.y + (seg.y - prev.y) * t)}`);
                    }
                }
            });
        }

        const tileCost = (from, to) => {
            const tileKey = key(to);
            const onRoad = roadTiles.has(tileKey);
            const onHardscape = hardscapeTiles.has(tileKey);
            const onPiste = pisteTiles.has(tileKey);
            const isGoal = to.x === goal.x && to.y === goal.y;
            const terrainType = landcover ? landcover[to.y * gridSize + to.x] : 0;

            if (terrainType === 2) return Infinity;

            let movementCost = onRoad || onHardscape ? 1 : onPiste ? 1.9 : 10.5;
            if (!onRoad && !onHardscape && !onPiste && !isGoal) {
                if (terrainType === 1) movementCost += 14;
                if (terrainType === 3) movementCost += 34;
            }

            if (heightmap) {
                const fromZ = heightmap[from.y * gridSize + from.x] || 0;
                const toZ = heightmap[to.y * gridSize + to.x] || 0;
                const uphill = toZ - fromZ;
                if (!onRoad && !onHardscape && uphill > 8) return Infinity;
                if (!onRoad && !onHardscape && !onPiste && uphill > 5) return Infinity;
                movementCost += uphill > 0
                    ? uphill * (onPiste ? 0.9 : 2.8)
                    : Math.abs(uphill) * 0.16;
            }

            const distFromStart = Math.abs(to.x - start.x) + Math.abs(to.y - start.y);
            const distToGoal = Math.abs(goal.x - to.x) + Math.abs(goal.y - to.y);
            if (!onRoad && !onHardscape && !onPiste && distFromStart > 5 && distToGoal > 4) {
                movementCost += 18;
            }

            return movementCost;
        };

        const openSet = [start];
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        gScore.set(key(start), 0);
        fScore.set(key(start), h(start));

        let iterations = 0;
        const maxIters = 65000;

        while (openSet.length > 0 && iterations < maxIters) {
            iterations++;
            let current = openSet[0];
            let currentIdx = 0;
            let lowestF = fScore.get(key(current)) ?? Infinity;
            for (let i = 1; i < openSet.length; i++) {
                const f = fScore.get(key(openSet[i])) ?? Infinity;
                if (f < lowestF) { current = openSet[i]; currentIdx = i; lowestF = f; }
            }

            if (current.x === goal.x && current.y === goal.y) {
                const path = [];
                let temp = current;
                while (cameFrom.has(key(temp))) {
                    path.push({ x: temp.x + 0.5, y: temp.y + 0.5 });
                    temp = cameFrom.get(key(temp));
                }
                return path.reverse();
            }

            openSet.splice(currentIdx, 1);
            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.x >= gridSize || neighbor.y < 0 || neighbor.y >= gridSize) continue;
                const nKey = key(neighbor);
                if (this.isTileBlockedForGuests(neighbor.x, neighbor.y, ignoreBuilding)) continue;
                const stepCost = tileCost(current, neighbor);
                if (!Number.isFinite(stepCost)) continue;
                const tentativeG = (gScore.get(key(current)) ?? Infinity) + stepCost;
                if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                    cameFrom.set(nKey, current);
                    gScore.set(nKey, tentativeG);
                    fScore.set(nKey, tentativeG + h(neighbor) * 1.1);
                    if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }

        const directDist = Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y);
        if (directDist <= 3) {
            return [{ x: goal.x + 0.5, y: goal.y + 0.5 }];
        }
        return [];
    }

    updatePistes(deltaTime) {
        const dtMin = deltaTime / 60000; // Delta in minutes
        const baseDegradationPerMin = 0.3; // 30% per minute (5% every 10 seconds)

        this.pistes.forEach(p => {
            // Only degrade if not currently being groomed
            if (!p.isBeingGroomed) {
                // Global piste degradation
                p.condition = Math.max(0.01, p.condition - baseDegradationPerMin * dtMin);

                // Sync all ungroomed segments to global condition
                if (p.segmentConditions && p.segments) {
                    p.segments.forEach((seg, idx) => {
                        // Only degrade segments that haven't been freshly groomed
                        if (p.segmentConditions[idx] < 0.99) {
                            p.segmentConditions[idx] = p.condition;
                        }
                    });
                }
            }

            // If condition falls below 50%, mark as needs grooming
            if (p.condition < 0.5) {
                p.needsGrooming = true;
            }
        });
    }


    /**
     * Enhanced breakdown for the Statistics panel.
     */
    getDetailedReport() {
        const breakdown = this.getOperatingCostBreakdown();
        const potentialMonthlyRev = this.calculatePotentialSkiPassSales() * this.getSkiPassPrice() * 30;

        return {
            costs: {
                total: breakdown.total,
                lifts: breakdown.lifts,
                pisten: breakdown.slopeOps,
                infrastructure: breakdown.infrastructure
            },
            revenue: {
                projectedMonthly: potentialMonthlyRev,
                lastDay: this.lastDailyRevenue || 0
            },
            balance: this.money
        };
    }

    /**
     * A* Pathfinding implementation
     */
    findPath(startX, startY, endX, endY, heightmap, gridSize, landcover, ignoreBuilding = null) {
        const start = { x: Math.floor(startX), y: Math.floor(startY) };
        const goal = { x: Math.floor(endX), y: Math.floor(endY) };

        if (start.x === goal.x && start.y === goal.y) return [];
        if (start.x < 0 || start.x >= gridSize || start.y < 0 || start.y >= gridSize) return [];
        if (goal.x < 0 || goal.x >= gridSize || goal.y < 0 || goal.y >= gridSize) return [];

        const key = (p) => `${p.x},${p.y}`;
        const h = (p) => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);

        const obstacles = new Set();
        this.buildings.forEach(b => {
            if (ignoreBuilding && b === ignoreBuilding) return;
            if (b.type.isRoad) return;
            const size = b.type.size;
            for (let dx = 0; dx < size.width; dx++) {
                for (let dy = 0; dy < size.height; dy++) {
                    obstacles.add(`${b.x + dx},${b.y + dy}`);
                }
            }
        });

        const pisteTiles = new Set();
        this.pistes.forEach(piste => {
            if (piste.segments && piste.segments.length > 0) {
                piste.segments.forEach((seg, sIdx) => {
                    const px = Math.floor(seg.x);
                    const py = Math.floor(seg.y);
                    pisteTiles.add(`${px},${py}`);

                    if (sIdx > 0) {
                        const prev = piste.segments[sIdx - 1];
                        const dist = Math.sqrt((seg.x - prev.x) ** 2 + (seg.y - prev.y) ** 2);
                        const steps = Math.ceil(dist * 2);
                        for (let s = 1; s < steps; s++) {
                            const t = s / steps;
                            const tx = Math.floor(prev.x + (seg.x - prev.x) * t);
                            const ty = Math.floor(prev.y + (seg.y - prev.y) * t);
                            pisteTiles.add(`${tx},${ty}`);
                        }
                    }
                });
            }
        });

        obstacles.delete(key(start));
        obstacles.delete(key(goal));

        for (let pass = 1; pass <= 2; pass++) {
            const openSet = [start];
            const cameFrom = new Map();
            const gScore = new Map();
            const fScore = new Map();
            gScore.set(key(start), 0);
            fScore.set(key(start), h(start));

            let iterations = 0;
            const maxIters = pass === 1 ? 5000 : 8000;

            while (openSet.length > 0 && iterations < maxIters) {
                iterations++;
                let current = openSet[0];
                let currentIdx = 0;
                let lowestF = fScore.get(key(current)) ?? Infinity;
                for (let i = 1; i < openSet.length; i++) {
                    const f = fScore.get(key(openSet[i])) ?? Infinity;
                    if (f < lowestF) { current = openSet[i]; currentIdx = i; lowestF = f; }
                }

                if (current.x === goal.x && current.y === goal.y) {
                    const path = [];
                    let temp = current;
                    while (cameFrom.has(key(temp))) {
                        path.push({ x: temp.x + 0.5, y: temp.y + 0.5 });
                        temp = cameFrom.get(key(temp));
                    }
                    return path.reverse();
                }

                openSet.splice(currentIdx, 1);
                const neighbors = [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }];
                const currentZ = heightmap[current.y * gridSize + current.x];

                for (const neighbor of neighbors) {
                    if (neighbor.x < 0 || neighbor.x >= gridSize || neighbor.y < 0 || neighbor.y >= gridSize) continue;
                    const nKey = key(neighbor);
                    if (obstacles.has(nKey) && nKey !== key(goal)) continue;

                    const isOnPiste = pisteTiles.has(nKey);
                    let landcoverPenalty = 0;
                    if (landcover) {
                        const nIdx = neighbor.y * gridSize + neighbor.x;
                        const type = landcover[nIdx];
                        if (type === 2) continue; // Water always blocked

                        const distFromStart = Math.sqrt((neighbor.x - start.x) ** 2 + (neighbor.y - start.y) ** 2);
                        if (!isOnPiste && distFromStart > 1.5) {
                            if (type === 1 || type === 3) {
                                if (pass === 1) continue; // Hard block forest/rock in pass 1
                                landcoverPenalty = (type === 1) ? 300 : 600; // Extreme penalty in pass 2
                            }
                        }

                        if (!isOnPiste && current !== start && isCliff(neighbor.x, neighbor.y, heightmap, gridSize)) {
                            if (pass === 1) continue;
                            landcoverPenalty += 400;
                        }

                        const nZ = heightmap[neighbor.y * gridSize + neighbor.x];
                        const diff = Math.abs(nZ - currentZ);
                        if (diff > (isOnPiste ? 30 : 20)) continue;

                        const baseCost = isOnPiste ? 1.0 : 15.0; // Very strong snow penalty
                        const movementCost = baseCost + (diff * 0.5) + landcoverPenalty;

                        const tentativeG = (gScore.get(key(current)) ?? Infinity) + movementCost;
                        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                            cameFrom.set(nKey, current);
                            gScore.set(nKey, tentativeG);
                            fScore.set(nKey, tentativeG + h(neighbor));
                            if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
                                openSet.push(neighbor);
                            }
                        }
                    }
                }
            }
            return [];
        }

    }

    // Get parking lot occupancy (for UI display)
    getParkingOccupancy(parkingLot) {
        if (!parkingLot) return null;

        let occupied = 0;
        let total = 0;

        // Parking Garage (Counter Logic + Visuals if any)
        if (parkingLot.type.id === 'parking_garage') {
            // Garage logic might use a simple counter since vehicles "disappear" inside
            occupied = parkingLot.currentOccupancy || 0;
            total = parkingLot.type.capacity || 500;
        }
        // Parking Lot (Agent Logic - Count real cars)
        else if (parkingLot.type.id === 'parking_lot') {
            occupied = this.traffic.filter(v =>
                v.parkingLot === parkingLot && v.state.startsWith('PARKING')
            ).length;
            total = parkingLot.type.capacity || 34; // Max 34
        }
        // Bus Stop (Agent Logic - Count real buses)
        else if (parkingLot.type.id === 'bus_stop') {
            occupied = this.traffic.filter(v =>
                v.parkingLot === parkingLot && v.state.startsWith('PARKING')
            ).length;
            total = parkingLot.type.capacity || 6; // Max 6
        }

        return {
            occupied,
            total,
            percentage: total > 0 ? Math.round((occupied / total) * 100) : 0,
            text: `Auslastung: ${occupied} / ${total}` // Unified Text
        };
    }
}

export class Helicopter {
    constructor(station) {
        this.station = station;
        // Start on roof
        this.x = station.x + station.type.size.width / 2;
        this.y = station.y + station.type.size.height / 2;
        // Station z is likely ground. Roof is higher.
        this.baseZ = station.z || 0;
        this.z = this.baseZ + 2.5; // Height of hospital roof

        this.state = 'LANDED'; // LANDED, TAKEOFF, CRUISING, APPROACH, RESCUE_HOVER, RESCUE_LAND, RETURN, LANDING
        this.timer = 0;
        this.target = null;
        this.speed = 12; // Speed in tiles/sec
        this.rotation = 0;
        this.rotorSpeed = 0;
        this.altitude = 15; // Flight altitude

        this.rescueDuration = 5; // Seconds to rescue
        this.isWinching = false;
    }

    pickRescueTarget(gridSize, getZ) {
        // Random spot in the world
        const tx = Math.floor(Math.random() * gridSize);
        const ty = Math.floor(Math.random() * gridSize);
        // Ensure it's not off map
        return { x: tx, y: ty, z: getZ(tx, ty) };
    }

    update(dt, gridSize, getZ) {
        this.timer += dt;
        const terrainZ = getZ(this.x, this.y);

        // Rotor Animation Logic
        let targetRotorSpeed = 25; // Default flying
        if (this.state === 'LANDED') {
            // Spool up in last 3 seconds (timer > 7)
            if (this.timer < 7) targetRotorSpeed = 0;
            else targetRotorSpeed = 25;
        }

        this.rotorSpeed += (targetRotorSpeed - this.rotorSpeed) * dt * 0.5; // Slower spool up
        if (!this.rotorAngle) this.rotorAngle = 0;
        this.rotorAngle += this.rotorSpeed * dt;

        switch (this.state) {
            case 'LANDED':
                this.isWinching = false;
                this.x = this.station.x + this.station.type.size.width / 2;
                this.y = this.station.y + this.station.type.size.height / 2;
                // Fix: Roof height is 50 pixels (2 floors)
                this.z = (this.station.z || terrainZ) + 50;

                // Wait for next mission
                if (this.timer > 10) {
                    this.state = 'TAKEOFF';
                    this.timer = 0;

                    // Generate Patrol Path (4 random waypoints)
                    this.patrolPath = [];
                    for (let i = 0; i < 4; i++) {
                        const tx = Math.floor(Math.random() * gridSize);
                        const ty = Math.floor(Math.random() * gridSize);
                        this.patrolPath.push({ x: tx, y: ty, z: getZ(tx, ty) });
                    }
                    this.target = this.patrolPath.shift();
                }
                break;

            case 'TAKEOFF':
                // Rise to 100m altitude (vertical)
                // Assuming z units approx meters? Or consistent with world scale.
                // User asked for "100m". 
                const takeoffAlt = (this.station.z || terrainZ) + 100;

                this.z += dt * 15; // Faster ascent?

                // Tilt nose up slightly? (Visual only, handled in draw)

                if (this.z >= takeoffAlt) {
                    this.state = 'CRUISING';
                    this.timer = 0;
                }
                break;

            case 'CRUISING': {
                // Fly to target
                if (this.target) {
                    const dx = this.target.x - this.x;
                    const dy = this.target.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    this.targetRotation = Math.atan2(dy, dx);

                    // Smooth rotation
                    let diff = this.targetRotation - this.rotation;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.rotation += diff * dt * 2;

                    // Move
                    this.x += Math.cos(this.rotation) * this.speed * dt;
                    this.y += Math.sin(this.rotation) * this.speed * dt;

                    // Maintain High Altitude (100m relative to ground below)
                    // Or keep absolute? "100m nach oben" -> Keep high.
                    // Let's aim for terrainZ + 100
                    const groundZ = getZ(this.x, this.y);
                    const cruiseAlt = groundZ + 100;
                    this.z += (cruiseAlt - this.z) * dt * 0.5;

                    // Waypoint reached logic
                    if (dist < 2.0) {
                        if (this.patrolPath && this.patrolPath.length > 0) {
                            // NEXT WAYPOINT
                            this.target = this.patrolPath.shift();
                        } else {
                            // END OF PATROL -> RETURN
                            this.state = 'RETURN';
                            this.target = {
                                x: this.station.x + this.station.type.size.width / 2,
                                y: this.station.y + this.station.type.size.height / 2,
                                z: this.station.z
                            };
                        }
                    }
                }
                break;
            }

            // Bypass APPROACH / RESCUE for now (Pure Patrol)
            case 'APPROACH':
                this.state = 'RETURN';
                break;


            case 'RESCUE_HOVER':
                this.isWinching = true;
                // Hover animation (light bobbing)
                this.z = (this.target.z + 6) + Math.sin(Date.now() / 500) * 0.5;

                if (this.timer > this.rescueDuration) {
                    this.isWinching = false;
                    this.state = 'TAKEOFF_FROM_RESCUE';
                    this.timer = 0;
                }
                break;

            case 'RESCUE_LAND':
                this.z = this.target.z; // On ground
                // Maybe spin down rotor? No, keep running for quick getaway
                if (this.timer > this.rescueDuration) {
                    this.state = 'TAKEOFF_FROM_RESCUE';
                    this.timer = 0;
                }
                break;

            case 'TAKEOFF_FROM_RESCUE':
                // Rise back up
                this.z += dt * 5;
                if (this.z >= terrainZ + this.altitude) {
                    this.state = 'RETURN';
                    this.target = {
                        x: this.station.x + this.station.type.size.width / 2,
                        y: this.station.y + this.station.type.size.height / 2,
                        z: this.station.z // don't care about z here really
                    };
                }
                break;

            case 'RETURN': {
                // Fly back to station
                if (this.target) {
                    const dx = this.target.x - this.x;
                    const dy = this.target.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    this.targetRotation = Math.atan2(dy, dx);
                    // Smooth rotation
                    let diff = this.targetRotation - this.rotation;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    this.rotation += diff * dt * 2;

                    // Move
                    this.x += Math.cos(this.rotation) * this.speed * dt;
                    this.y += Math.sin(this.rotation) * this.speed * dt;

                    // Maintain Altitude
                    this.z += ((terrainZ + 15) - this.z) * dt;

                    if (dist < 1.0 || dist < this.speed * dt) {
                        // SKIP LANDING ANIMATION (Prevents Crash)
                        this.state = 'LANDED';
                        this.timer = 0;
                        // Snap to Roof Center
                        const rx = this.station.x + this.station.type.size.width / 2;
                        const ry = this.station.y + this.station.type.size.height / 2;
                        this.x = rx;
                        this.y = ry;
                        this.rotation = 0; // Reset rotation
                        // Fix: Roof height is 50 pixels (2 floors)
                        this.z = (this.station.z || terrainZ) + 50;
                    }
                }
                break;
            }

            case 'LANDING':
                // Align with roof center
                const rx = this.station.x + this.station.type.size.width / 2;
                const ry = this.station.y + this.station.type.size.height / 2;

                // Move towards center
                this.x += (rx - this.x) * dt;
                this.y += (ry - this.y) * dt;

                const roofZ = (this.station.z || terrainZ) + 2.5;
                if (this.z > roofZ) {
                    this.z -= dt * 3;
                } else {
                    // BUS
                    const bw = 0.22;
                    const bl = subtype === 0 ? 0.9 : 0.7; // Updated length
                    this.state = 'LANDED';
                    this.rotation = 0;
                }
                break;
        }
    }
}
