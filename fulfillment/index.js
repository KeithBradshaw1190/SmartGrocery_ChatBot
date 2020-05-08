// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
//used to make api call

var request = require('request');
const {
    google
} = require('googleapis');
const customsearch = google.customsearch('v1');
const functions = require('firebase-functions');
const admin = require("firebase-admin");
const {
    WebhookClient,
    Payload
} = require('dialogflow-fulfillment');
const {
    Card,
    Suggestion,
    Image,
    Carousel
} = require('dialogflow-fulfillment');
const axios = require('axios');
//Access Firebase DB
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://smartgrocery-88590.firebaseio.com"
});
const db = admin.firestore();
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({
        request,
        response
    });

    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
    console.log('Inside Main function');
    //let action = JSON.stringify(request.body);
    var messengerID = request.body.originalDetectIntentRequest.payload.data.sender.id;
    //let userArray =  userInfo();
    console.log("main " + request.body.originalDetectIntentRequest.payload.data.sender.id);
    console.log("messenger ID in main " + messengerID);

    function welcome(agent) {
        agent.setFollowupEvent('sign-in');
        agent.add(`Welcome to Smartgrocery!`);
    }



    function fallback(agent) {

        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);

    }

    function signin(agent) {
        console.log("Sigin in prompted");

        console.log("sign in" + agent.parameters[0]);
    }


    function orders(agent) {
        console.log("agent params" + agent.parameters);
        // var messengerID = request.body.queryResult.outputContexts[0].parameters.facebook_sender_id;
        let genericParams = agent.getContext("__system_counters__");
        console.log("generic " + genericParams)
        //   let messengerID = genericParams.facebook_sender_id;
        console.log("in orders messengerID " + messengerID);
        //console.log("in orders messengerID " + request.body.queryResult.outputContexts[0].parameters.facebook_sender_id);
        const parameters = request.body.queryResult.parameters;
        var scheduled_date = parameters.scheduled_date.split('T')[0];
        var scheduled_time = parameters.scheduled_time.replace('Z', '').split('T')[1].split('+')[0];
        var order_type = parameters.order_type;
        var list_name = parameters.list_name;

        var storeID;
        var userName;
        const usersRef = db.collection('users');
        return usersRef.where('messengerID', '==', messengerID)
            .get()
            .then(snapshot => {
                if (snapshot.empty) {
                    //No Messenger ID associated
                    return agent.setFollowupEvent('sign-in');
                } else {
                    snapshot.forEach(doc => {
                        console.log(doc.data());
                        if (doc.data().storeId) {
                            storeID = doc.data().storeId;
                            userName = doc.data().name;

                        } else {
                            // No StoreID so user needs to link shop in SmartGrocery Account
                            return agent.add("Please head to your SmartGrocery Account and link to a Grocery Store First!");
                        }
                    });
                    console.log("If else for delivery/pickup" + [scheduled_date, scheduled_time, list_name, messengerID, storeID]);
                    if (order_type == "Delivery") {
                        let ctx = {
                            'name': 'list',
                            'lifespan': 5,
                            'parameters': {
                                'userName': userName,
                                'storeID': storeID,
                                'messengerID': messengerID,
                                'order_type': order_type,
                                'scheduled_date': scheduled_date,
                                'scheduled_time': scheduled_time,
                                'list_name': list_name
                            }
                        };
                        agent.setContext(ctx);
                        agent.setFollowupEvent("dtc");
                        //return delivery(agent, scheduled_date, scheduled_time, list_name, messengerID, storeID);
                    } else if (order_type == "Pick-up") {
                        console.log("Order type is pick-up");
                        let ctx = {
                            'name': 'list',
                            'lifespan': 5,
                            'parameters': {
                                'userName': userName,
                                'storeID': storeID,
                                'messengerID': messengerID,
                                'order_type': order_type,
                                'scheduled_date': scheduled_date,
                                'scheduled_time': scheduled_time,
                                'list_name': list_name
                            }
                        };
                        agent.setContext(ctx);
                        agent.setFollowupEvent("ptc");
                        //return pickup(agent, scheduled_date, scheduled_time, list_name, messengerID, storeID);
                    }
                }

            }).catch((err) => {
                return agent.add('An Error occurred. Can you try again?' + err);
            });
    }








    function findShoppingList(agent) {
        console.log("In slist function");
        const parameters = request.body.queryResult.parameters;
        var shopping_list_name = parameters.shopping_list_name;
        // var messengerID = request.body.queryResult.outputContexts[0].parameters.facebook_sender_id;
        if (messengerID == null) {
            console.log("its undefined");
            return agent.add("Oh it looks like you're not signed in!");
        }
        console.log("shopping list name: " + shopping_list_name);
        console.log("messenger id: " + messengerID);


        if (shopping_list_name == undefined || shopping_list_name == "") {
            return getAllLists(agent, messengerID).then((data) => {
                return agent.add(data);
            }).catch(() => {
                return agent.add("I cant find any lists right now, the connection might be slow");
            });
        } else {
            //getSingleList(agent,shopping_list_name, messengerID);
            let ctx = {
                'name': 'listMessage',
                'lifespan': 5,
                'parameters': {
                    'list_name': shopping_list_name,
                    'messengerID': messengerID
                }
            };
            agent.setContext(ctx);
            agent.setFollowupEvent('sl-follow');

        }
    }

    function cFollowUp(agent) {
        console.log("in collection follow up");
        let listParams = agent.getContext("list").parameters;
        let customParams = agent.getContext("newpickup").parameters;
        let genericParams = agent.getContext("generic").parameters;
        let storeID = customParams.storeID;
        let userName = customParams.userName;

        let og_date = genericParams['scheduled_date.original'];
        let og_time = genericParams['scheduled_time.original'];
        let scheduled_date = listParams.scheduled_date;
        let scheduled_time = listParams.scheduled_time;
        let list_name = genericParams.list_name;
        let pqArray = customParams.pqArray;
        //  let messengerID = genericParams.facebook_sender_id;


        console.log("customParams in follow up for pickup: " + JSON.stringify(customParams));
        console.log("genericParams in follow up for pickup: " + JSON.stringify(genericParams));
        console.log("listparams in follow up for pickup: " + JSON.stringify(listParams));


        return axios.post('https://supermarketmock-api.herokuapp.com/api/pickup/' + storeID, {
                list_name: list_name,
                pickup_time: scheduled_time,
                pickup_date: scheduled_date,
                messengerID: messengerID
            })
            .then(function (response) {
                //Agent Responds with card of success
                console.log("pickup post success!");

                let payload = {

                    "attachment": {
                        "type": "template",
                        "payload": {
                            "template_type": "receipt",
                            "recipient_name": userName,
                            "order_number": "12345678902",
                            "currency": "EUR",
                            "payment_method": "SmartGrocery",
                            "order_url": "https://smartgrocery-manager.herokuapp.com/",
                            "summary": {
                                "total_cost": pqArray[0]
                            },
                            "elements": [{
                                "title": list_name,
                                "subtitle": "Collection scheduled successfully! Collect " + og_date + " at " + og_time,
                                "quantity": pqArray[1],
                                "price": pqArray[0],
                                "currency": "EUR",
                                "image_url": "https://cdn.pixabay.com/photo/2020/04/14/18/54/market-5043895_960_720.png"
                            }]
                        }
                    }

                };
                return agent.add(new Payload(agent.FACEBOOK, payload, {
                    sendAsMessage: true,
                    rawPayload: false
                }));


                // return agent.add("Your " + list_name + " collection has been scheduled!\n" +
                //     "\nOrder Summary:" +
                //     "\nCollect " + og_date + " at " + og_time + "\n" +
                //     "\nTotal Cost: €" + pqArray[0] + "\nAmount of Goods: " + pqArray[1] + " items");
                // return Promise.resolve();
            })
            .catch(function (error) {
                console.log("error after card call" + error);
                agent.add("Tried to schedule your request but I cant find your shopping list, could you try again?");


            });
    }

    function dFollowUp(agent) {
        console.log("in  dfollow up");
        let listParams = agent.getContext("list").parameters;

        let customParams = agent.getContext("newdelivery").parameters;
        let genericParams = agent.getContext("generic").parameters;
        let storeID = customParams.storeID;
        let userName = customParams.userName;

        let og_date = genericParams['scheduled_date.original'];
        let og_time = genericParams['scheduled_time.original'];
        let scheduled_date = listParams.scheduled_date;
        let scheduled_time = listParams.scheduled_time;
        let list_name = genericParams.list_name;
        let pqArray = customParams.pqArray;
        //        let messengerID = genericParams.facebook_sender_id;

        console.log("customParams: " + JSON.stringify(customParams));
        console.log("genericParams: " + JSON.stringify(genericParams));
        console.log("listParams: " + JSON.stringify(listParams));


        return axios.post('https://supermarketmock-api.herokuapp.com/api/delivery/' + storeID, {
                list_name: list_name,
                delivery_time: scheduled_time,
                delivery_date: scheduled_date,
                messengerID: messengerID
            })
            .then(function (response) {
                console.log("Delivery Post Response" + response);
                //Agent Responds with card of success
                console.log("delivery post success!");
                //console.log("original " + og_date);
                console.log("original " + og_time);

                // Payload Test
                let payload = {
                    "attachment": {
                        "type": "template",
                        "payload": {
                            "template_type": "receipt",
                            "recipient_name": userName,
                            "order_number": "12345678902",
                            "currency": "EUR",
                            "payment_method": "SmartGrocery",
                            "order_url": "https://smartgrocery-manager.herokuapp.com/",
                            "summary": {
                                "total_cost": pqArray[0]
                            },
                            "elements": [{
                                "title": list_name,
                                "subtitle": "Delivery ordered successfully! Due: " + og_date + " at " + og_time,
                                "quantity": pqArray[1],
                                "price": pqArray[0],
                                "currency": "EUR",
                                "image_url": "https://cdn3.iconfinder.com/data/icons/delivery-services-2/64/grocery-delivery-supermarket-courier-errand-512.png"
                            }]
                        }
                    }

                };
                agent.add(new Payload(agent.FACEBOOK, payload, {
                    sendAsMessage: true,
                    rawPayload: false
                }));

                //
                // return agent.add("Your " + list_name + " delivery has been scheduled!\n" +
                //     "\nOrder Summary:" +
                //     "\nExpected " + og_date + " at " + og_time + "\n" +
                //     "\nTotal Cost: €" + pqArray[0] + "\nAmount of Goods: " + pqArray[1] + " items");

            })
            .catch(function (error) {
                console.log("error after card call" + error);
                agent.add("Tried to schedule your request but I cant find your shopping list, could you try again?");


            });
    }

    function slFollowUp(agent) {
        console.log("In slFollowUp");
        let params = request.body.queryResult.outputContexts[1].parameters;
        // let messengerID = params.messengerID;
        let list_name = params.list_name;
        var shopping_list_qp = [];
        const listDoc = db.collection('shopping_lists');
        var string;
        return listDoc.where("messengerID", "==", messengerID)
            .where("listName", "==", list_name).get().then(snapshot => {
                displayMessage(agent, snapshot);

            });
    }

    function ingredientsFromList(agent, list_name, messengerID) {
        //Gets 2 random items from a shopping list that fall into a food department category
        //These are returned to then find a recipe
        var departmentArray = ["Fresh Food", "Food Cupboard"];
        var listItems;
        const listDoc = db.collection('shopping_lists');
        return listDoc.where("messengerID", "==", messengerID).where("listName", "==", list_name).get()
            .then(snapshot => {
                if (snapshot.empty) {
                    console.log('No matching documents.');
                    return agent.add("I can't find that shopping list does it exist?");
                } else {
                    snapshot.forEach(doc => {
                        console.log("Using ingredients from" + doc.data().listName);
                        listItems = doc.data().items;
                    });

                    //Filter list items to those within food departments
                    var potentialIngredients = listItems.filter(function (item) {
                        return departmentArray.indexOf(item.department) >= 0;
                    });
                    console.log(potentialIngredients);

                    if (!potentialIngredients) {
                        return agent.add("Not enough food items in your list to find a recipe right now!");
                    } else {
                        return potentialIngredients;
                    }
                }

                //return Promise.resolve(string);
            }).catch((err) => {
                agent.add('Hmm, have you added any grocery lists?' + err);
            });
    }

    function itemsByFrequency(agent) {
        console.log("In itemsByFrequency");
        const parameters = request.body.queryResult.parameters;
        var frequency_param = parameters.purchase_frequencies;
        //var messengerID = request.body.queryResult.outputContexts[0].parameters.facebook_sender_id;
        if (messengerID == null) {
            console.log("messenger ID undefined in itemByFrequency" + messengerID);
            return agent.add("Oh it looks like you're not signed in!");
        }


        if (frequency_param == undefined || frequency_param == "") {
            console.log("Undefined or null frequency param" + frequency_param);
        } else {

            return getAllListsForFrequency(agent, messengerID, frequency_param).then((data) => {
                return agent.add(data);
            }).catch(() => {
                return agent.add("I cant find any lists right now, the connection might be slow so please try again!");
            });
        }

    }

    function recipeFromShoppinglist(agent) {
        const parameters = request.body.queryResult.parameters;
        //var recipe_type = parameters.recipe_types;
        var shopping_list_name = parameters.list_name;
        //var messengerID = request.body.queryResult.outputContexts[0].parameters.facebook_sender_id;
        if (messengerID == null) {
            console.log("its undefined");
            return agent.add("Oh it looks like you're not signed in!");
        }
        console.log("shopping list name: " + shopping_list_name);
        console.log("messenger id: " + messengerID);


        if (shopping_list_name == undefined || shopping_list_name == "") {
            console.log("caught in if" + [shopping_list_name, messengerID]);
            return agent.add("A shopping list wasnt specified for the ingredients!");

        } else {
            console.log("In else about to return ingredients from list");
            return ingredientsFromList(agent, shopping_list_name, messengerID).then((ingredients) => {
                console.log("About to call recipe form list follow up." + ingredients);
                let ctx = {
                    'name': 'ingredientparams',
                    'lifespan': 5,
                    'parameters': {
                        'ingredientItems': ingredients,
                        'list_name': shopping_list_name,
                        'messengerID': messengerID
                    }
                };
                agent.setContext(ctx);
                agent.setFollowupEvent('recipefromlist');
            });

        }
    }


    function displayMessage(agent, snapshot) {
        console.log("Display message")
        var string = "";
        var shopping_list_qp = [];
        if (snapshot.empty) {
            console.log('No matching documents.');
            return agent.add("I cant find any lists, make sure one exists and try again!");
        } else {
            snapshot.forEach(doc => {
                console.log(doc.id);
                shopping_list_qp.push(doc.data());
                console.log("Shopping List qp in single list " + shopping_list_qp);
                string = string + `📝 ${doc.data().listName} \n𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆 𝗼𝗳 𝗜𝘁𝗲𝗺𝘀: ${doc.data().list_quantity}\n𝗧𝗼𝘁𝗮𝗹 𝗣𝗿𝗶𝗰𝗲:€${doc.data().list_price}\n\nList Contents:`;
                var items_arr = doc.data().items;
                items_arr.forEach(itemsDesc => {
                    string = string + `\n\u2022${itemsDesc.name} 𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆: ${itemsDesc.quantity}.\n`;
                });
            });
        }
        return agent.add(string);
    }


    function showRecipeFromList(agent) {
        console.log("show recipe from list follow up");

        let customParams = agent.getContext("ingredientparams").parameters;
        //Loop through and get the simple names of 2 random items and then show recipe!

        let ingredientItems = customParams.ingredientItems;
        let ingredientItemsAmount = ingredientItems.length;
        const randomIng1 = ingredientItems[Math.floor(Math.random() * ingredientItemsAmount)];
        const randomIng2 = ingredientItems[Math.floor(Math.random() * ingredientItemsAmount)];



        var ing1 = randomIng1.simpleName;
        var ing2 = randomIng2.simpleName;
        console.log("random ingredient1 =>", ing1);
        console.log("random ingredient2 =>", ing2);



        // let ingredient
        var recipe_type = "recipe";
        var ingredients = [ing1, ing2];
        //console.log("ingredient params" + JSON.stringify(customParams));
        console.log("Show recipe follow up");
        return getRecipe(ingredients, recipe_type, agent).then((result) => {
                console.log("Get recipe result found!" + result);
                let ctx = {
                    'name': 'recipes',
                    'lifespan': 5,
                    'parameters': {
                        'result': result
                    }
                };
                agent.setContext(ctx);
                agent.setFollowupEvent('displayRecipes');

            })
            .catch((err) => {
                console.log(err);
                agent.add(`Tried searching for a recipe with ${ing1} & ${ing2} but couldnt find any. Try specify the ingredients and ask for a recipe`);
            })
    }

    function displayRecipes(agent) {
        console.log("display recipes follow up");
        let customParams = agent.getContext("recipes").parameters;


        let result = customParams.result;
        if (result.length >= 3) {
            const card1 = new Card(result[0].title);
            card1.setImage(result[0].img);
            card1.setText(result[0].snippet);
            card1.setButton({
                text: "View The Recipe",
                url: result[0].link
            });
            const card2 = new Card(result[1].title);
            card2.setImage(result[1].img);
            card2.setText(result[1].snippet);
            card2.setButton({
                text: "View The Recipe",
                url: result[1].link
            });

            const card3 = new Card(result[2].title);
            card3.setImage(result[2].img);
            card3.setText(result[2].snippet);
            card3.setButton({
                text: "View The Recipe",
                url: result[2].link
            });
            agent.add(card1);
            agent.add(card2);
            agent.add(card3);
        } else if (result.length < 3) {
            const card1 = new Card(result[0].title);
            card1.setImage(result[0].img);
            card1.setText(result[0].snippet);
            card1.setButton({
                text: "View The Recipe",
                url: result[0].link
            });
            agent.add(card1);
        } else {
            agent.add("I couldnt find a recipe, Can you try that one more time?")
        }


    }

    function findRecipe(agent) {
        const parameters = request.body.queryResult.parameters;
        var recipe_type = parameters.recipe_type;
        var ingredients = parameters.recipe_ingredients;
        return getRecipe(ingredients, recipe_type, agent).then((result) => {
            console.log("Get recipe result found!");
            const card1 = new Card(result[0].title);
            card1.setImage(result[0].img);
            card1.setText(result[0].snippet);
            card1.setButton({
                text: "View The Recipe",
                url: result[0].link
            });
            const card2 = new Card(result[1].title);
            card2.setImage(result[1].img);
            card2.setText(result[1].snippet);
            card2.setButton({
                text: "View The Recipe",
                url: result[1].link
            });

            const card3 = new Card(result[2].title);
            card3.setImage(result[2].img);
            card3.setText(result[2].snippet);
            card3.setButton({
                text: "View The Recipe",
                url: result[2].link
            });
            agent.add(card1);
            agent.add(card2);
            agent.add(card3);

        }).catch((err) => {
            console.log(err);
            agent.add(`I'm sorry, I cant find a recipe for that right now.`);
        });



    }


    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Find me a recipe', findRecipe);
    intentMap.set('Display Shopping List', findShoppingList);
    intentMap.set('Delivery Or Pickup', orders);
    intentMap.set('Sign-in', signin);
    intentMap.set('delivery-followUp', dFollowUp);
    intentMap.set('collection-followUp', cFollowUp);
    intentMap.set('dtc', delivery);
    intentMap.set('ptc', pickup);
    intentMap.set('shoppingList-followup', slFollowUp);
    //Recipe from shopping list
    intentMap.set('Recipe from shopping list', recipeFromShoppinglist);
    intentMap.set('showRecipeFromList', showRecipeFromList);
    intentMap.set('displayRecipes', displayRecipes);
    intentMap.set('Items by purchase frequency', itemsByFrequency);
    // intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
});


function delivery(agent) {
    const delivery_open = "07:00:00";
    const delivery_closed = "20:00:00";
    let genericParams = agent.getContext("list").parameters;
    let scheduled_time = genericParams.scheduled_time;
    let list_name = genericParams.list_name;
    let messengerID = genericParams.messengerID;
    let storeID = genericParams.storeID;
    let userName = genericParams.userName;
    // let list_name = genericParams.
    console.log("delivery params" + JSON.stringify(genericParams));
    console.log("In delivery");
    //scheduled_date, scheduled_time, list_name, messengerID, storeID
    // return checkOrderTime().then(data => {
    if (scheduled_time >= delivery_open && scheduled_time <= delivery_closed) {
        console.log("Time is available");
        return getPQ(agent, list_name, messengerID).then((pqArray) => {


            let ctx = {
                'name': 'newdelivery',
                'lifespan': 6,
                'parameters': {
                    'userName': userName,
                    'storeID': storeID,
                    'messengerID': messengerID,
                    'pqArray': pqArray
                }
            };
            agent.setContext(ctx);
            return agent.setFollowupEvent('d-follow');
            // return agent.setFollowupEvent('sign-in');

            //console.log("Got Pq now following up" + storeID + "/" + messengerID);

        }).catch(() => {
            console.log("Cant find shopping list");
            return agent.add("I cant find that shopping list, does " + list_name + " exist");
        });
    } else {
        //  console.log("Time is not available" + scheduled_time);
        return agent.add("Looks like delivery is only available from " + delivery_open + " until " + delivery_closed);
    }
    //});
}

function pickup(agent) {
    const pickup_open = "09:00:00";
    const pickup_closed = "22:00:00";
    console.log("In pickup");
    // console.log("In pickup with storeID: " + storeID);

    let genericParams = agent.getContext("list").parameters;
    console.log("pickup params" + JSON.stringify(genericParams));

    let scheduled_time = genericParams.scheduled_time;
    let list_name = genericParams.list_name;
    let messengerID = genericParams.messengerID;
    let storeID = genericParams.storeID;
    let userName = genericParams.userName;

    if (scheduled_time >= pickup_open && scheduled_time <= pickup_closed) {
        return getPQ(agent, list_name, messengerID).then((pqArray) => {
            console.log("PQ result" + pqArray);

            let ctx = {
                'name': 'newpickup',
                'lifespan': 5,
                'parameters': {
                    'userName': userName,
                    'storeID': storeID,
                    'messengerID': messengerID,
                    'pqArray': pqArray
                }
            };
            agent.setContext(ctx);
            agent.setFollowupEvent('c-follow');
        }).catch(() => {
            agent.add("I cant find that shopping list, does " + list_name + " exist?");
        });
    } else {
        return agent.add("Looks like Pick-Up is only available from " + pickup_open + " until " + pickup_closed);
    }

}


function getAllLists(agent, messengerID) {
    const listDoc = db.collection('shopping_lists');
    console.log("Getting all lists");

    return listDoc.where("messengerID", "==", messengerID).get()
        .then(snapshot => {
            var shopping_lists = [];
            var string = '\n';
            if (snapshot.empty) {
                agent.add(`No grocery lists, please go to https://smartgrocery-manager.herokuapp.com/ and create a grocery list.`);
            } else {
                snapshot.forEach(doc => {

                    string = string + `\n📝 ${doc.data().listName} \n𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆 𝗼𝗳 𝗜𝘁𝗲𝗺𝘀: ${doc.data().list_quantity}\n𝗧𝗼𝘁𝗮𝗹 𝗣𝗿𝗶𝗰𝗲:€${doc.data().list_price}\n\nList Contents:`;
                    var items_arr = doc.data().items;
                    items_arr.forEach(itemsDesc => {
                        string = string + `\n\u2022${itemsDesc.name} 𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆: ${itemsDesc.quantity}.\n`;
                    });

                });


            }
            console.log("Console log in second fucntion " + string);
            return Promise.resolve(string);
        }).catch(() => {
            agent.add('Error reading entry from the Firestore database.');
            agent.add('Hmm, have you added any grocery lists?');
        });
}

function getAllListsForFrequency(agent, messengerID, frequency_param) {
    var listName = "";
    var string = "";
    var items_arr = [];
    console.log("getAllListsForFrequency" + frequency_param);

    const listDoc = db.collection('shopping_lists');

    return listDoc.where("messengerID", "==", messengerID).get()
        .then(snapshot => {
            if (snapshot.empty) {
                return agent.add(`No grocery lists, please go to https://smartgrocery-manager.herokuapp.com/ and create a grocery list.`);
            } else {
                snapshot.forEach(doc => {
                    listName = doc.data().listName;
                    items_arr = doc.data().items;
                    //  string = string + `📝${listName}\n`;
                    items_arr.forEach(itemsDesc => {
                        console.log("Item frequency is" + itemsDesc.frequency + " item name is " + itemsDesc.name + " list name " + listName);
                        if (itemsDesc.frequency == frequency_param) {
                            console.log("Matched frequency");
                            string = string + `\u2022 ${itemsDesc.name} 𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆: ${itemsDesc.quantity} (📝 ${listName}).\n\n`;
                            console.log(string);

                        }
                    });
                });
                if (string == "") {
                    string = "Looks you dont have any items purchased by this frequency.";
                }
                console.log(string);
                return Promise.resolve(string);
            }

        }).catch(() => {
            agent.add('Error reading entry from your account with that request!');
        });

}

function getPQ(agent, list_name, messengerID) {
    console.log("Getting PQ for " + [list_name, messengerID]);
    const listDoc = db.collection('shopping_lists');
    var details = [];

    return listDoc.where("messengerID", "==", messengerID).where("listName", "==", list_name)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                agent.add('I cant find that list :( try ask me to find all your shopping lists to make sure it exists');
            } else {
                snapshot.forEach(doc => {
                    //agent.add("Name Of the Shopping List: "+doc.data().listName);
                    var price = doc.data().list_price;
                    var quantity = doc.data().list_quantity;

                    details.push(price, quantity);

                });

            }
            return Promise.resolve(details);
        }).catch(() => {
            agent.add('Error reading entry from the Firestore database.');
            agent.add('Hmm, have you added any grocery lists?');
        });
}

function getSingleList(agent, list_name, messengerID) {
    console.log("Getting single list list name: " + list_name + "messenger ID: " + messengerID);
    var shopping_list_qp = [];
    const listDoc = db.collection('shopping_lists');

    return listDoc.where("messengerID", "==", messengerID)
        .where("listName", "==", list_name).get()
        .then(snapshot => {
            if (snapshot.empty) {
                console.log('No matching documents.');
                return;
            } else {

                //shopping_list_qp.push(doc.data());
                console.log("Else is single list ");
                let ctx = {
                    'name': 'listMessage',
                    'lifespan': 5,
                    'parameters': {
                        'snapshot': snapshot
                    }
                };
                agent.setContext(ctx);
                agent.setFollowupEvent('sl-follow');

            }

            //return Promise.resolve(string);
        }).catch(() => {
            agent.add('Hmm, have you added any grocery lists?');
        });
}

function getRecipe(ingredients, recipe_type, agent) {
    console.log("recipe type" + recipe_type);


    var q = ingredients;
    if ((recipe_type) || !(recipe_type == null)) {
        q = recipe_type + " " + ingredients;
    }
    console.log('In Function Get recipe');

    var key = "AIzaSyBGXw65shPqxo76bd2ZVcRmUOJNJz_cvJ0";
    var cx = "012036365062121134258:khnjgcndhea";


    var start = 1;
    var num = 1;

    return new Promise((resolve, reject) => {
        customsearch.cse.list({
            auth: key,
            cx: cx,
            q,
            num: 5
        }).then((result) => {
            const {
                queries,
                items,
                searchInformation
            } = result.data;
            console.log("RESULT.DATA" + JSON.stringify(items));
            if (items != undefined) {
                console.log("rdata is defined")
                const data = {
                    items: items.map(o => ({
                        link: o.link,
                        title: o.title,
                        snippet: o.snippet,
                        img: (((o.pagemap || {}).cse_image || {})[0] || {}).src
                    }))
                };

                console.log("DATA ITEMS" + data.items);
                var returned_array = data.items;
                console.log("First Element title" + returned_array[0].title);
                const title = returned_array[0].title;
                console.log("Returned array before being sent" + title);
                return resolve(returned_array);
            } else {
                console.log("data items is not filled" + JSON.stringify(items))
                return reject("Couldnt find a recipe that time, can you try again or search with specific ingredients?");
            }

        }).catch((error) => {
            console.log("Get recipe error in catch" + error);
        });
    });




    // // Uncomment and edit to make your own intent handler
    // // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
    // // below to get this function to be run when a Dialogflow intent is matched
    // function yourFunctionHandler(agent) {
    //   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
    //   agent.add(new Card({
    //       title: `Title: this is a card title`,
    //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
    //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
    //       buttonText: 'This is a button',
    //       buttonUrl: 'https://assistant.google.com/'
    //     })
    //   );
    //   agent.add(new Suggestion(`Quick Reply`));
    //   agent.add(new Suggestion(`Suggestion`));
    //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
    // }


    // Run the proper function handler based on the matched Dialogflow intent name



}